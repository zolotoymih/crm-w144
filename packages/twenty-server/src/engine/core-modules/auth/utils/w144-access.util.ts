import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { type Request } from 'express';

// What a W144 company's payment state allows in its CRM (the owner of W144:
// the trial runs without AI operations, and after it without a plan the
// workspace is read only), the same rule the W144 engine applies over the
// same row of company_billing. Both wait for live payments and the same
// switches as the engine: the trial's AI pause for PLAN_LIMIT_ON, read only
// for PLAN_GATES_ON. With them off nothing is asked.
export type W144Access = { trial: boolean; readOnly: boolean; aiOpen: boolean };

type BillingRow = {
  status?: string | null;
  trial_ends_at?: string | null;
  complimentary?: boolean | null;
} | null;

const gatesOn = () => process.env.PLAN_GATES_ON === 'true';
const limitOn = () => process.env.PLAN_LIMIT_ON === 'true';

export const w144AccessFrom = (
  row: BillingRow,
  now = Date.now(),
  flags = { gates: gatesOn(), limit: limitOn() },
): W144Access => {
  const status = String(row?.status ?? 'trialing');
  const free = row?.complimentary === true;
  const ends = row?.trial_ends_at
    ? new Date(row.trial_ends_at).getTime()
    : null;
  const ended = status === 'trialing' && ends !== null && ends <= now;
  const readOnly = flags.gates && !free && (status === 'read_only' || ended);
  const trial = status === 'trialing' && !ended && !free;

  return { trial, readOnly, aiOpen: !readOnly && !(flags.limit && trial) };
};

export class W144ReadOnlyException extends Error {
  readonly status = 403;
  readonly code = 'READ_ONLY';

  constructor() {
    super(
      'The workspace is read only: the trial is over and no plan is chosen yet. Everything is here to see and export; pick a plan in W144 to write again.',
    );
    this.name = 'W144ReadOnlyException';
  }
}

export class W144TrialNoAiException extends Error {
  readonly status = 403;
  readonly code = 'TRIAL_NO_AI';

  constructor() {
    super('AI operations are not part of the trial. They open with a plan.');
    this.name = 'W144TrialNoAiException';
  }
}

const OPEN: W144Access = { trial: false, readOnly: false, aiOpen: true };

let client: SupabaseClient | null = null;
const supabase = (): SupabaseClient | null => {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_KEY?.trim();

  if (!url || !key) return null;
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
};

// a page asks several times a second: a minute per workspace is enough
const kept = new Map<string, { at: number; access: W144Access }>();

/** The access of the company that owns a workspace (hub_connections, else crm_workspace_kept). */
export const w144AccessOfWorkspace = async (
  workspaceId: string,
): Promise<W144Access> => {
  if (!gatesOn() && !limitOn()) return OPEN;
  const hit = kept.get(workspaceId);

  if (hit && Date.now() - hit.at < 60_000) return hit.access;
  const db = supabase();

  if (!db) return OPEN;
  const { data: conn } = await db
    .from('hub_connections')
    .select('company_id')
    .eq('hub_type', 'crm')
    .eq('workspace_id', workspaceId)
    .limit(1)
    .maybeSingle();
  const { data: kept2 } = conn?.company_id
    ? { data: null }
    : await db
        .from('crm_workspace_kept')
        .select('company_id')
        .eq('workspace_id', workspaceId)
        .limit(1)
        .maybeSingle();
  const companyId = (conn?.company_id ?? kept2?.company_id) as
    | string
    | undefined;

  if (!companyId) return OPEN;
  const { data } = await db
    .from('company_billing')
    .select('status, trial_ends_at, complimentary')
    .eq('company_id', companyId)
    .maybeSingle();
  const access = w144AccessFrom(data as BillingRow);

  kept.set(workspaceId, { at: Date.now(), access });

  return access;
};

// the full path: under a mounted middleware request.path is cut to the mount
const pathOf = (request: Request): string =>
  (request.originalUrl ?? request.url ?? '').split('?')[0];

const graphqlQueryOf = (request: Request): string => {
  const body = request.body as { query?: unknown } | unknown[] | undefined;

  if (Array.isArray(body)) {
    return body
      .map((b) => String((b as { query?: unknown })?.query ?? ''))
      .join('\n');
  }

  return typeof (body as { query?: unknown })?.query === 'string'
    ? ((body as { query: string }).query ?? '')
    : '';
};

/** The top level fields of every mutation in a GraphQL document. */
export const w144MutationFields = (doc: string): string[] => {
  const out: string[] = [];
  const start = /\bmutation\b[^{]*\{/g;
  let m: RegExpExecArray | null;

  while ((m = start.exec(doc)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;

    while (i < doc.length && depth > 0) {
      const ch = doc[i];

      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '(') {
        // arguments are skipped whole, strings and all
        let d = 1;

        i++;
        while (i < doc.length && d > 0) {
          if (doc[i] === '(') d++;
          else if (doc[i] === ')') d--;
          i++;
        }
        continue;
      } else if (depth === 1 && /[A-Za-z_]/.test(ch)) {
        const word = /^[A-Za-z_]\w*/.exec(doc.slice(i))![0];
        const after = doc.slice(i + word.length).trimStart();

        // «alias: field» names the field after the colon
        if (!after.startsWith(':') && !word.startsWith('__')) out.push(word);
        i += word.length;
        continue;
      }
      i++;
    }
  }

  return out;
};

// Mutations that sign a person in or keep them signed in, and analytics:
// they keep working in a read only workspace, or nobody could open it.
const STAYS_OPEN = new Set([
  'exchangeSupabaseSessionForAuthTokens',
  'renewToken',
  'getAuthTokensFromLoginToken',
  'getLoginTokenFromCredentials',
  'getAuthTokensFromOTP',
  'signOut',
  'track',
  'trackAnalytics',
]);

/** A request that writes: a GraphQL mutation or upload, or a REST call that is not a read. */
export const w144WritesSomething = (request: Request): boolean => {
  const path = pathOf(request);

  if (path.startsWith('/graphql') || path.startsWith('/metadata')) {
    if ((request.headers['content-type'] ?? '').includes('multipart/form-data'))
      return true;

    return w144MutationFields(graphqlQueryOf(request)).some(
      (field) => !STAYS_OPEN.has(field),
    );
  }

  return !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
};

/** A request that runs a model: the AI chat and text generation. */
export const w144RunsAi = (request: Request): boolean => {
  const path = pathOf(request);

  if (path.startsWith('/rest/ai/')) return true;

  return /\bsendChatMessage\b/.test(graphqlQueryOf(request));
};

/** Refuses a request the company's payment state does not allow, before it runs. */
export const assertW144RequestOpen = async (
  request: Request,
  workspaceId: string | undefined,
): Promise<void> => {
  if (!workspaceId || (!gatesOn() && !limitOn())) return;
  const ai = w144RunsAi(request);
  const writes = w144WritesSomething(request);

  if (!ai && !writes) return;
  const access = await w144AccessOfWorkspace(workspaceId);

  if (access.readOnly && writes) throw new W144ReadOnlyException();
  if (ai && !access.aiOpen) {
    throw access.readOnly
      ? new W144ReadOnlyException()
      : new W144TrialNoAiException();
  }
};
