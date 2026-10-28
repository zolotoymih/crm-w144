import { BtiApiKeyProvisioningService } from 'src/engine/core-modules/auth/services/bti-api-key-provisioning.service';
import { type SupabaseAuthClient } from 'src/engine/core-modules/auth/services/supabase-auth-client.provider';
import { W144EngineKeyBackfillService } from 'src/engine/core-modules/auth/services/w144-engine-key-backfill.service';
import { type W144OpportunityLostStageService } from 'src/engine/core-modules/auth/services/w144-opportunity-lost-stage.service';

type Row = { company_id: string; workspace_id: string; api_key: string | null };

// a Supabase query that answers with the given rows whatever it is chained with
const supabaseWith = (rows: Row[]) => {
  const calls: string[] = [];
  const query: Record<string, unknown> = {};

  for (const method of ['select', 'eq', 'not', 'update']) {
    query[method] = (...args: unknown[]) => {
      calls.push(`${method}(${args.map(String).join(', ')})`);

      return query;
    };
  }
  query.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: rows, error: null });

  const from = jest.fn(() => query);

  return {
    client: { client: { from } } as unknown as SupabaseAuthClient,
    from,
    calls,
  };
};

const build = (
  rows: Row[],
  opts: { server?: boolean; failFor?: string } = {},
) => {
  const supabase = supabaseWith(rows);
  const mintForCompany = jest.fn(async (companyId: string) => {
    if (companyId === opts.failFor) throw new Error('No Admin role');

    return { workspaceId: 'w' };
  });
  const ensureLostStage = jest.fn(async (workspaceId: string) =>
    workspaceId === 'ws-a'
      ? { status: 'added' as const, optionId: 'o' }
      : { status: 'already-present' as const },
  );
  const service = new W144EngineKeyBackfillService(
    { httpAdapter: opts.server === false ? undefined : {} } as never,
    supabase.client,
    { mintForCompany } as unknown as BtiApiKeyProvisioningService,
    { ensureLostStage } as unknown as W144OpportunityLostStageService,
  );

  return { service, supabase, mintForCompany, ensureLostStage };
};

describe('W144EngineKeyBackfillService', () => {
  it('does nothing in the queue worker, which has no HTTP server', () => {
    const { service, supabase } = build([], { server: false });

    service.onApplicationBootstrap();

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('reads only hosted CRM rows linked to a workspace', async () => {
    const { service, supabase } = build([]);

    await service.run();

    expect(supabase.from).toHaveBeenCalledWith('hub_connections');
    expect(supabase.calls).toEqual(
      expect.arrayContaining([
        'eq(hub_type, crm)',
        'eq(platform, twenty-hosted)',
        'not(workspace_id, is, null)',
      ]),
    );
  });

  it('makes a key only where there is none, and adds the Lost stage everywhere', async () => {
    const { service, mintForCompany, ensureLostStage } = build([
      { company_id: 'co-a', workspace_id: 'ws-a', api_key: null },
      { company_id: 'co-b', workspace_id: 'ws-b', api_key: 'kept' },
    ]);

    const result = await service.run();

    expect(mintForCompany).toHaveBeenCalledTimes(1);
    expect(mintForCompany).toHaveBeenCalledWith('co-a');
    expect(ensureLostStage.mock.calls).toEqual([['ws-a'], ['ws-b']]);
    expect(result).toEqual({ minted: ['co-a'], failed: [], lostStage: ['ws-a'] });
  });

  it('goes on to the next company when one fails', async () => {
    const { service, mintForCompany } = build(
      [
        { company_id: 'co-a', workspace_id: 'ws-a', api_key: null },
        { company_id: 'co-b', workspace_id: 'ws-b', api_key: null },
      ],
      { failFor: 'co-a' },
    );

    const result = await service.run();

    expect(mintForCompany).toHaveBeenCalledTimes(2);
    expect(result.minted).toEqual(['co-b']);
    expect(result.failed).toEqual(['co-a']);
  });
});

describe('BtiApiKeyProvisioningService', () => {
  it('makes no key for a company with no linked workspace, whatever its address names', async () => {
    const supabase = supabaseWith([]);
    // the row a company keeps from before a rename: no workspace of its own,
    // an address with another company's subdomain
    (supabase.client.client as unknown as { from: jest.Mock }).from = jest.fn(
      () => {
        const q: Record<string, unknown> = {};

        for (const m of ['select', 'eq']) q[m] = () => q;
        q.maybeSingle = async () => ({
          data: {
            workspace_id: null,
            subdomain: 'other-company',
            base_url: 'https://other-company.crm.example.com',
          },
          error: null,
        });

        return q;
      },
    );
    const findOne = jest.fn(async () => ({ id: 'other-workspace' }));
    const service = new BtiApiKeyProvisioningService(
      { findOne } as never,
      {} as never,
      {} as never,
      supabase.client,
    );

    await expect(service.mintForCompany('co-renamed')).rejects.toThrow(
      'No workspace linked',
    );
    expect(findOne).not.toHaveBeenCalled();
  });
});
