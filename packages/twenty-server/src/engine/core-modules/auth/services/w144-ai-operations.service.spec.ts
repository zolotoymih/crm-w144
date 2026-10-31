import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { SUPABASE_AUTH_CLIENT } from 'src/engine/core-modules/auth/services/supabase-auth-client.provider';
import {
  aiOperationRows,
  operationsOf,
  W144AiOperationsService,
} from 'src/engine/core-modules/auth/services/w144-ai-operations.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';

const WORKSPACE_ID = 'workspace-id';
const COMPANY_ID = 'company-id';
const USER_WORKSPACE = 'user-workspace-id';
const TWENTY_USER = 'twenty-user-id';
const LOGIN = 'w144-login-id';

// micro-credits are millionths of a dollar
const chat = (
  dollars: number,
  userWorkspaceId: string | null = USER_WORKSPACE,
) => ({
  resourceType: 'AI',
  operationType: 'AI_CHAT_TOKEN',
  creditsUsedMicro: Math.round(dollars * 1_000_000),
  quantity: 18_400,
  unit: 'TOKEN',
  resourceContext: 'claude-sonnet',
  userWorkspaceId,
});

describe('operationsOf', () => {
  it('weighs an answer by its model cost, 0.05 dollars an operation', () => {
    expect(operationsOf(30_000)).toBe(0.6);
    expect(operationsOf(150_000)).toBe(3);
  });

  it('counts anything the model was paid for as at least 0.01, and nothing as 0', () => {
    expect(operationsOf(120)).toBe(0.01);
    expect(operationsOf(0)).toBe(0);
  });
});

describe('aiOperationRows', () => {
  it('keeps the chat, the workflow AI step and web search, and leaves out what is not AI', () => {
    const rows = aiOperationRows([
      chat(0.03),
      {
        ...chat(0.1),
        operationType: 'AI_WORKFLOW_TOKEN',
        userWorkspaceId: null,
      },
      {
        ...chat(0.01),
        operationType: 'WEB_SEARCH',
        unit: 'INVOCATION',
        quantity: 2,
      },
      {
        ...chat(0.2),
        resourceType: 'WORKFLOW',
        operationType: 'WORKFLOW_EXECUTION',
      },
    ]);

    expect(rows).toEqual([
      {
        userWorkspaceId: USER_WORKSPACE,
        action: 'crm_chat',
        cost_ops: 0.6,
        detail: { model: 'claude-sonnet', tokens: 18_400 },
      },
      {
        userWorkspaceId: null,
        action: 'crm_workflow_ai',
        cost_ops: 2,
        detail: { model: 'claude-sonnet', tokens: 18_400 },
      },
      {
        userWorkspaceId: USER_WORKSPACE,
        action: 'crm_web_search',
        cost_ops: 0.2,
        detail: { model: 'claude-sonnet', calls: 2 },
      },
    ]);
  });
});

describe('W144AiOperationsService', () => {
  let service: W144AiOperationsService;
  let inserted: unknown[];
  let connection: { company_id: string } | null;

  const query = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({
        data: table === 'hub_connections' ? connection : null,
        error: null,
      }),
      insert: async (rows: unknown[]) => {
        expect(table).toBe('crm_ai_operations');
        inserted.push(...rows);

        return { error: null };
      },
    };

    return chain;
  };

  beforeEach(async () => {
    inserted = [];
    connection = { company_id: COMPANY_ID };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        W144AiOperationsService,
        {
          provide: getRepositoryToken(UserWorkspaceEntity),
          useValue: {
            find: jest.fn(async () => [
              { id: USER_WORKSPACE, userId: TWENTY_USER },
            ]),
          },
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: {
            find: jest.fn(async () => [
              { id: TWENTY_USER, email: 'mara@kestrel.test' },
            ]),
          },
        },
        {
          provide: SUPABASE_AUTH_CLIENT,
          useValue: {
            url: 'http://supabase.test',
            client: {
              from: (table: string) => query(table),
              rpc: jest.fn(async () => ({ data: LOGIN, error: null })),
            },
          },
        },
      ],
    }).compile();

    service = module.get(W144AiOperationsService);
  });

  const batch = (events: unknown[]) =>
    ({ name: 'USAGE_RECORDED', workspaceId: WORKSPACE_ID, events }) as never;

  it('writes the answer with the company and the W144 login of the person', async () => {
    const out = await service.write(batch([chat(0.042)]));

    expect(out).toEqual([
      {
        company_id: COMPANY_ID,
        user_id: LOGIN,
        action: 'crm_chat',
        cost_ops: 0.84,
        detail: { model: 'claude-sonnet', tokens: 18_400 },
      },
    ]);
    expect(inserted).toEqual(out);
  });

  it('writes nothing for a workspace no W144 company has', async () => {
    connection = null;

    expect(await service.write(batch([chat(0.042)]))).toEqual([]);
    expect(inserted).toEqual([]);
  });
});
