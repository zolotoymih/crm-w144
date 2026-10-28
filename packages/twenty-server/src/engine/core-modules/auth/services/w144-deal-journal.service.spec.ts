import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import { SUPABASE_AUTH_CLIENT } from 'src/engine/core-modules/auth/services/supabase-auth-client.provider';
import {
  dealChangeLine,
  dealJournalRows,
  W144DealJournalService,
} from 'src/engine/core-modules/auth/services/w144-deal-journal.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';

const WORKSPACE_ID = 'workspace-id';
const COMPANY_ID = 'company-id';
const TWENTY_USER = 'twenty-user-id';
const LOGIN = 'w144-login-id';

const update = (
  fields: string[],
  before: Record<string, string>,
  after: Record<string, string>,
  userId: string | null = TWENTY_USER,
) => ({
  recordId: 'deal-id',
  userId: userId ?? undefined,
  properties: { updatedFields: fields, before, after },
});

describe('dealChangeLine', () => {
  it('names the stage move and the other fields, never their values', () => {
    expect(
      dealChangeLine(
        update(
          ['stage', 'amount', 'closeDate'],
          { name: 'Acme', stage: 'MEETING' },
          { name: 'Acme', stage: 'CUSTOMER' },
        ),
      ),
    ).toBe('stage from Meeting to Customer, amount and close date');
  });

  it('leaves out a move on the board', () => {
    expect(dealChangeLine(update(['position', 'updatedAt'], {}, {}))).toBe('');
  });
});

describe('dealJournalRows', () => {
  it('writes one row a deal, and none for a board move or a write with no person', () => {
    const rows = dealJournalRows(DatabaseEventAction.UPDATED, [
      update(
        ['stage'],
        { name: 'Acme', stage: 'NEW' },
        { name: 'Acme', stage: 'LOST' },
      ),
      update(['position'], { name: 'Beta' }, { name: 'Beta' }),
      update(['amount'], { name: 'Gamma' }, { name: 'Gamma' }, null),
    ]);

    expect(rows).toEqual([
      {
        userId: TWENTY_USER,
        action: 'Changed the deal “Acme”',
        detail: 'stage from New to Lost',
      },
    ]);
  });

  it('makes one row for many deals at once', () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      update(
        ['stage'],
        { name: `D${i}`, stage: 'NEW' },
        { name: `D${i}`, stage: 'MEETING' },
      ),
    );

    expect(dealJournalRows(DatabaseEventAction.UPDATED, many)).toEqual([
      {
        userId: TWENTY_USER,
        action: 'Changed 7 deals',
        detail: 'stage from New to Meeting',
      },
    ]);
  });

  it('says where a deleted deal went', () => {
    expect(
      dealJournalRows(DatabaseEventAction.DELETED, [
        {
          recordId: 'd',
          userId: TWENTY_USER,
          properties: { before: { name: 'Acme' }, after: { name: 'Acme' } },
        },
      ]),
    ).toEqual([
      {
        userId: TWENTY_USER,
        action: 'Deleted the deal “Acme”',
        detail: 'Into the CRM trash',
      },
    ]);
  });
});

describe('W144DealJournalService', () => {
  let service: W144DealJournalService;
  let inserted: unknown[];
  let connection: { company_id: string } | null;
  let insertError: { message: string } | null;

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
        inserted.push(...rows);

        return { error: insertError };
      },
    };

    return chain;
  };

  beforeEach(async () => {
    inserted = [];
    connection = { company_id: COMPANY_ID };
    insertError = null;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        W144DealJournalService,
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

    service = module.get(W144DealJournalService);
  });

  const batch = (events: unknown[]) =>
    ({
      name: 'opportunity.updated',
      workspaceId: WORKSPACE_ID,
      objectMetadata: {},
      events,
    }) as never;

  it('writes the row with the company and the W144 login of the person', async () => {
    const out = await service.write(
      DatabaseEventAction.UPDATED,
      batch([
        update(
          ['stage'],
          { name: 'Acme', stage: 'PROPOSAL' },
          { name: 'Acme', stage: 'CUSTOMER' },
        ),
      ]),
    );

    expect(out).toEqual([
      {
        company_id: COMPANY_ID,
        actor_id: LOGIN,
        kind: 'crm',
        action: 'Changed the deal “Acme”',
        detail: 'stage from Proposal to Customer',
      },
    ]);
    expect(inserted).toEqual(out);
  });

  it('writes nothing for a workspace no W144 company has', async () => {
    connection = null;
    const out = await service.write(
      DatabaseEventAction.CREATED,
      batch([
        {
          recordId: 'd',
          userId: TWENTY_USER,
          properties: { after: { name: 'Acme' } },
        },
      ]),
    );

    expect(out).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it('never throws when the journal refuses the row', async () => {
    insertError = { message: 'violates check constraint' };
    await expect(
      service.write(
        DatabaseEventAction.CREATED,
        batch([
          {
            recordId: 'd',
            userId: TWENTY_USER,
            properties: { after: { name: 'Acme' } },
          },
        ]),
      ),
    ).resolves.toEqual([]);
  });
});
