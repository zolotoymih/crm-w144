import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { In, Repository } from 'typeorm';

import { OnCustomBatchEvent } from 'src/engine/api/graphql/graphql-query-runner/decorators/on-custom-batch-event.decorator';
import {
  SUPABASE_AUTH_CLIENT,
  type SupabaseAuthClient,
} from 'src/engine/core-modules/auth/services/supabase-auth-client.provider';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { type CustomWorkspaceEventBatch } from 'src/engine/workspace-event-emitter/types/custom-workspace-batch-event.type';

// The event Twenty's AI billing emits for every model call it prices
// (ai-billing.service.ts), read here by name and by the fields this service
// uses, so nothing of the usage module is imported.
const USAGE_RECORDED = 'USAGE_RECORDED';

export type AiUsage = {
  resourceType: string;
  operationType: string;
  creditsUsedMicro: number;
  quantity: number;
  resourceContext?: string | null;
  userWorkspaceId?: string | null;
};

// What each priced AI use is called in the W144 ledger (bti-engine
// lib/w144/operations.ts names them on the billing screen).
const ACTION: Record<string, string> = {
  AI_CHAT_TOKEN: 'crm_chat',
  AI_WORKFLOW_TOKEN: 'crm_workflow_ai',
  WEB_SEARCH: 'crm_web_search',
};

// One W144 operation is 0.05 dollars of model cost: a Web page costs the
// model 0.24 to 0.30 dollars for 6 operations (ux-plan/operations-weights.md),
// which is what the 0.10 a operation over the limit is set against. Twenty
// prices the turn itself from the tokens it spent at the model's prices
// (input, output, cache reads and writes), in micro-credits of 0.000001
// dollars, so a chat answer weighs what it actually cost.
export const DOLLARS_PER_OPERATION = 0.05;
const MICRO_CREDITS_PER_DOLLAR = 1_000_000;

export const operationsOf = (creditsUsedMicro: number): number => {
  if (!(creditsUsedMicro > 0)) return 0;
  const ops =
    creditsUsedMicro / MICRO_CREDITS_PER_DOLLAR / DOLLARS_PER_OPERATION;

  // the ledger keeps two decimals; anything the model was paid for is at least 0.01
  return Math.max(0.01, Math.round(ops * 100) / 100);
};

export type W144AiOperationRow = {
  company_id: string;
  user_id: string | null;
  action: string;
  cost_ops: number;
  detail: { model: string | null; tokens?: number; calls?: number };
};

/** The ledger rows of a batch, before the company and the login are known. */
export const aiOperationRows = (
  events: AiUsage[],
): (Omit<W144AiOperationRow, 'company_id' | 'user_id'> & {
  userWorkspaceId: string | null;
})[] =>
  events
    .filter((e) => e.resourceType === 'AI' && ACTION[e.operationType])
    .map((e) => ({
      userWorkspaceId: e.userWorkspaceId ?? null,
      action: ACTION[e.operationType],
      cost_ops: operationsOf(e.creditsUsedMicro),
      detail:
        e.operationType === 'WEB_SEARCH'
          ? { model: e.resourceContext ?? null, calls: e.quantity }
          : { model: e.resourceContext ?? null, tokens: e.quantity },
    }))
    .filter((r) => r.cost_ops > 0);

// The CRM's AI operations in the W144 ledger (crm_ai_operations, bti-engine
// migration 043): each priced chat answer, AI step of a workflow and web
// search, for the company that owns the workspace (hub_connections, else
// crm_workspace_kept), by the W144 login of the person (Twenty's user, their
// email, the engine's login_of_email; none for a workflow that runs on its
// own). Runs where the model is called, the worker included. Never throws:
// the answer is given whatever happens here.
@Injectable()
export class W144AiOperationsService {
  private readonly logger = new Logger(W144AiOperationsService.name);

  constructor(
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @Inject(SUPABASE_AUTH_CLIENT)
    private readonly supabaseAuthClient: SupabaseAuthClient,
  ) {}

  @OnCustomBatchEvent(USAGE_RECORDED)
  async onUsage(batch: CustomWorkspaceEventBatch<AiUsage>) {
    await this.write(batch);
  }

  async write(
    batch: CustomWorkspaceEventBatch<AiUsage>,
  ): Promise<W144AiOperationRow[]> {
    try {
      if (!batch.workspaceId) return [];
      const rows = aiOperationRows(batch.events ?? []);

      if (rows.length === 0) return [];
      const companyId = await this.companyOf(batch.workspaceId);

      if (!companyId) return [];
      const logins = await this.loginsOf([
        ...new Set(
          rows.map((r) => r.userWorkspaceId).filter((id): id is string => !!id),
        ),
      ]);
      const out: W144AiOperationRow[] = rows.map((r) => ({
        company_id: companyId,
        user_id: r.userWorkspaceId
          ? (logins.get(r.userWorkspaceId) ?? null)
          : null,
        action: r.action,
        cost_ops: r.cost_ops,
        detail: r.detail,
      }));
      const { error } = await this.supabaseAuthClient.client
        .from('crm_ai_operations')
        .insert(out);

      if (error) {
        this.logger.warn(`AI operations not written: ${error.message}`);

        return [];
      }

      return out;
    } catch (error) {
      this.logger.warn(
        `AI operations not written: ${error instanceof Error ? error.message : String(error)}`,
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

  // userWorkspace id → W144 login
  private async loginsOf(
    userWorkspaceIds: string[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();

    if (userWorkspaceIds.length === 0) return out;
    const links = await this.userWorkspaceRepository.find({
      where: { id: In(userWorkspaceIds) },
      select: ['id', 'userId'],
    });
    const users = await this.userRepository.find({
      where: { id: In([...new Set(links.map((l) => l.userId))]) },
      select: ['id', 'email'],
    });
    const emailOf = new Map(users.map((u) => [u.id, u.email]));

    for (const link of links) {
      const email = emailOf.get(link.userId);

      if (!email) continue;
      const { data } = await this.supabaseAuthClient.client.rpc(
        'login_of_email',
        { p_email: email },
      );

      if (typeof data === 'string') out.set(link.id, data);
    }

    return out;
  }
}
