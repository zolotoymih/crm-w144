import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type ObjectRecordBaseEvent } from 'twenty-shared/database-events';
import { isDefined } from 'twenty-shared/utils';
import { In, Repository } from 'typeorm';

import { OnDatabaseBatchEvent } from 'src/engine/api/graphql/graphql-query-runner/decorators/on-database-batch-event.decorator';
import { DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import {
  SUPABASE_AUTH_CLIENT,
  type SupabaseAuthClient,
} from 'src/engine/core-modules/auth/services/supabase-auth-client.provider';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { type WorkspaceEventBatch } from 'src/engine/workspace-event-emitter/types/workspace-event-batch.type';

type Deal = {
  name?: string | null;
  stage?: string | null;
};

type DealEvent = ObjectRecordBaseEvent<Deal>;

export type W144JournalRow = {
  company_id: string;
  actor_id: string | null;
  kind: 'crm';
  action: string;
  detail: string | null;
};

// Fields a person does not change by editing a deal: order on the board,
// bookkeeping and the search index.
const NOT_AN_EDIT = new Set([
  'position',
  'updatedAt',
  'createdAt',
  'deletedAt',
  'searchVector',
  'createdBy',
  'updatedBy',
]);

const FIELD_WORD: Record<string, string> = {
  name: 'name',
  amount: 'amount',
  closeDate: 'close date',
  pointOfContactId: 'contact',
  companyId: 'company',
  ownerId: 'owner',
};

// More deals than this in one action make one row («Changed 12 deals»).
const ONE_ROW_FROM = 6;

const quote = (s: string) => `“${s.length > 80 ? `${s.slice(0, 79)}…` : s}”`;
const dealName = (d?: Deal | null) =>
  d?.name ? `the deal ${quote(d.name)}` : 'a deal';
const stageWord = (s?: string | null) =>
  s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : 'none';
const andList = (items: string[]) =>
  items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

// What changed on a deal, in one line: «stage from Meeting to Customer and
// amount». The values a person typed stay in the CRM.
export const dealChangeLine = (event: DealEvent): string => {
  const fields = (event.properties.updatedFields ?? []).filter(
    (f) => !NOT_AN_EDIT.has(f),
  );

  return andList(
    [...new Set(fields)].map((f) =>
      f === 'stage'
        ? `stage from ${stageWord(event.properties.before?.stage)} to ${stageWord(event.properties.after?.stage)}`
        : (FIELD_WORD[f] ??
          f
            .replace(/Id$/, '')
            .replace(/([A-Z])/g, ' $1')
            .toLowerCase()),
    ),
  );
};

const VERB: Record<string, string> = {
  [DatabaseEventAction.CREATED]: 'Added',
  [DatabaseEventAction.UPDATED]: 'Changed',
  [DatabaseEventAction.DELETED]: 'Deleted',
  [DatabaseEventAction.RESTORED]: 'Brought back',
  [DatabaseEventAction.DESTROYED]: 'Deleted',
};

const DETAIL: Record<string, string> = {
  [DatabaseEventAction.DELETED]: 'Into the CRM trash',
  [DatabaseEventAction.RESTORED]: 'From the CRM trash',
  [DatabaseEventAction.DESTROYED]: 'For good, from the CRM trash',
};

// The rows one batch of deal events makes, before the author is known: one a
// deal, or one for the lot from ONE_ROW_FROM. An update that only moved a
// card on the board makes none.
export const dealJournalRows = (
  action: DatabaseEventAction,
  events: DealEvent[],
): { userId: string; action: string; detail: string | null }[] => {
  const updated = action === DatabaseEventAction.UPDATED;
  const made = events
    .filter((e) => isDefined(e.userId))
    .map((e) => ({
      userId: e.userId as string,
      deal: e.properties.after ?? e.properties.before,
      line: updated ? dealChangeLine(e) : '',
    }))
    .filter((e) => !updated || e.line !== '');
  const verb = VERB[action] ?? 'Changed';

  if (made.length >= ONE_ROW_FROM) {
    const lines = [...new Set(made.map((e) => e.line).filter(Boolean))];

    return [
      {
        userId: made[0].userId,
        action: `${verb} ${made.length} deals`,
        detail: updated
          ? lines.length === 1
            ? lines[0]
            : null
          : (DETAIL[action] ?? null),
      },
    ];
  }

  return made.map((e) => ({
    userId: e.userId,
    action: `${verb} ${dealName(e.deal)}`,
    detail: updated ? e.line : (DETAIL[action] ?? null),
  }));
};

// A person's deal edits in a W144 company's CRM go into the company's action
// journal (engine audit_log, Settings, Journal; bti-engine migration 041,
// kind 'crm'), with the W144 login of whoever made them. The workspace's
// company comes from hub_connections, or crm_workspace_kept after the CRM
// was disconnected and kept. The login: Twenty's user, their email, the
// engine's login_of_email. Writes by an API key or a workflow carry no person
// and are left out. Never throws: the deal is saved whatever happens here.
@Injectable()
export class W144DealJournalService {
  private readonly logger = new Logger(W144DealJournalService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @Inject(SUPABASE_AUTH_CLIENT)
    private readonly supabaseAuthClient: SupabaseAuthClient,
  ) {}

  @OnDatabaseBatchEvent('opportunity', DatabaseEventAction.CREATED)
  async onCreated(batch: WorkspaceEventBatch<DealEvent>) {
    await this.write(DatabaseEventAction.CREATED, batch);
  }

  @OnDatabaseBatchEvent('opportunity', DatabaseEventAction.UPDATED)
  async onUpdated(batch: WorkspaceEventBatch<DealEvent>) {
    await this.write(DatabaseEventAction.UPDATED, batch);
  }

  @OnDatabaseBatchEvent('opportunity', DatabaseEventAction.DELETED)
  async onDeleted(batch: WorkspaceEventBatch<DealEvent>) {
    await this.write(DatabaseEventAction.DELETED, batch);
  }

  @OnDatabaseBatchEvent('opportunity', DatabaseEventAction.RESTORED)
  async onRestored(batch: WorkspaceEventBatch<DealEvent>) {
    await this.write(DatabaseEventAction.RESTORED, batch);
  }

  @OnDatabaseBatchEvent('opportunity', DatabaseEventAction.DESTROYED)
  async onDestroyed(batch: WorkspaceEventBatch<DealEvent>) {
    await this.write(DatabaseEventAction.DESTROYED, batch);
  }

  async write(
    action: DatabaseEventAction,
    batch: WorkspaceEventBatch<DealEvent>,
  ): Promise<W144JournalRow[]> {
    try {
      const rows = dealJournalRows(action, batch.events ?? []);

      if (rows.length === 0) return [];
      const companyId = await this.companyOf(batch.workspaceId);

      if (!companyId) return [];
      const logins = await this.loginsOf([
        ...new Set(rows.map((r) => r.userId)),
      ]);
      const out: W144JournalRow[] = rows.map((r) => ({
        company_id: companyId,
        actor_id: logins.get(r.userId) ?? null,
        kind: 'crm',
        action: r.action.slice(0, 300),
        detail: r.detail?.slice(0, 1000) ?? null,
      }));
      const { error } = await this.supabaseAuthClient.client
        .from('audit_log')
        .insert(out);

      if (error) {
        this.logger.warn(`deal journal not written: ${error.message}`);

        return [];
      }

      return out;
    } catch (error) {
      this.logger.warn(
        `deal journal not written: ${error instanceof Error ? error.message : String(error)}`,
      );

      return [];
    }
  }

  private async companyOf(workspaceId: string): Promise<string | null> {
    const db = this.supabaseAuthClient.client;
    const { data: conn } = await db
      .from('hub_connections')
      .select('company_id')
      .eq('hub_type', 'crm')
      .eq('workspace_id', workspaceId)
      .limit(1)
      .maybeSingle();

    if (conn?.company_id) return conn.company_id as string;
    const { data: kept } = await db
      .from('crm_workspace_kept')
      .select('company_id')
      .eq('workspace_id', workspaceId)
      .limit(1)
      .maybeSingle();

    return (kept?.company_id as string | undefined) ?? null;
  }

  private async loginsOf(userIds: string[]): Promise<Map<string, string>> {
    const users = await this.userRepository.find({
      where: { id: In(userIds) },
      select: ['id', 'email'],
    });
    const out = new Map<string, string>();

    for (const u of users) {
      const { data } = await this.supabaseAuthClient.client.rpc(
        'login_of_email',
        { p_email: u.email },
      );

      if (typeof data === 'string') out.set(u.id, data);
    }

    return out;
  }
}
