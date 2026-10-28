import { BadRequestException } from '@nestjs/common';

import { W144WorkspaceEraseController } from 'src/engine/core-modules/auth/controllers/w144-workspace-erase.controller';

const WORKSPACE = '3f1c2b9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f';
const COMPANY = '11111111-1111-4111-8111-111111111199';

type Answer = { data: unknown; error: { message: string } | null };

// A stand-in for the Supabase client: each table answers what the test says,
// whatever the filters (the filters are checked through `calls`).
const fakeSupabase = (answers: Record<string, Answer>) => {
  const calls: { table: string; filters: [string, string, unknown][] }[] = [];
  const from = (table: string) => {
    const call = { table, filters: [] as [string, string, unknown][] };

    calls.push(call);
    const answer = answers[table] ?? { data: null, error: null };
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        call.filters.push(['eq', column, value]);

        return chain;
      },
      is: (column: string, value: unknown) => {
        call.filters.push(['is', column, value]);

        return chain;
      },
      limit: () => Promise.resolve(answer),
      maybeSingle: () => Promise.resolve(answer),
    };

    return chain;
  };

  return { client: { from }, url: 'http://supabase.test', calls };
};

describe('W144WorkspaceEraseController', () => {
  let workspaceService: { deleteWorkspace: jest.Mock };
  let workspaceRepository: { findOne: jest.Mock };

  const build = (answers: Record<string, Answer>) => {
    const supabase = fakeSupabase(answers);
    const controller = new W144WorkspaceEraseController(
      workspaceService as never,
      workspaceRepository as never,
      supabase as never,
    );

    return { controller, supabase };
  };

  const erasedAndUnnamed: Record<string, Answer> = {
    company_erasure_leftovers: {
      data: { erased_company: COMPANY },
      error: null,
    },
    companies: { data: null, error: null },
    hub_connections: { data: [], error: null },
    crm_workspace_kept: { data: [], error: null },
  };

  beforeEach(() => {
    workspaceService = { deleteWorkspace: jest.fn().mockResolvedValue({}) };
    workspaceRepository = {
      findOne: jest.fn().mockResolvedValue({ id: WORKSPACE }),
    };
  });

  it('asks for a workspace id', async () => {
    const { controller } = build(erasedAndUnnamed);

    await expect(
      controller.erase({ workspaceId: 'abc' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.erase({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(workspaceService.deleteWorkspace).not.toHaveBeenCalled();
  });

  it('erases a workspace that waits, of a company that is gone, named nowhere', async () => {
    const { controller, supabase } = build(erasedAndUnnamed);

    await expect(
      controller.erase({ workspaceId: ` ${WORKSPACE} ` }),
    ).resolves.toEqual({
      erased: true,
    });
    expect(workspaceService.deleteWorkspace).toHaveBeenCalledWith(
      WORKSPACE,
      false,
    );
    const waiting = supabase.calls.find(
      (c) => c.table === 'company_erasure_leftovers',
    );

    expect(waiting?.filters).toEqual([
      ['eq', 'kind', 'crm_workspace'],
      ['eq', 'ref', WORKSPACE],
      ['is', 'done_at', null],
    ]);
  });

  it('erases nothing W144 has not decided to erase', async () => {
    const { controller } = build({
      ...erasedAndUnnamed,
      company_erasure_leftovers: { data: null, error: null },
    });

    await expect(controller.erase({ workspaceId: WORKSPACE })).resolves.toEqual(
      {
        erased: false,
        reason: 'not_waiting',
      },
    );
    expect(workspaceService.deleteWorkspace).not.toHaveBeenCalled();
  });

  it('keeps the workspace while its company is still there', async () => {
    const { controller } = build({
      ...erasedAndUnnamed,
      companies: { data: { id: COMPANY }, error: null },
    });

    await expect(controller.erase({ workspaceId: WORKSPACE })).resolves.toEqual(
      {
        erased: false,
        reason: 'company_exists',
      },
    );
    expect(workspaceService.deleteWorkspace).not.toHaveBeenCalled();
  });

  it('keeps a workspace a connection still names', async () => {
    const namings: Record<string, Answer>[] = [
      { hub_connections: { data: [{ id: 'conn' }], error: null } },
      { crm_workspace_kept: { data: [{ company_id: 'other' }], error: null } },
    ];

    for (const named of namings) {
      const { controller } = build({ ...erasedAndUnnamed, ...named });

      await expect(
        controller.erase({ workspaceId: WORKSPACE }),
      ).resolves.toEqual({ erased: false, reason: 'still_connected' });
    }
    expect(workspaceService.deleteWorkspace).not.toHaveBeenCalled();
  });

  it('says not_found for a workspace Twenty no longer has', async () => {
    workspaceRepository.findOne.mockResolvedValue(null);
    const { controller } = build(erasedAndUnnamed);

    await expect(controller.erase({ workspaceId: WORKSPACE })).resolves.toEqual(
      {
        erased: false,
        reason: 'not_found',
      },
    );
    expect(workspaceService.deleteWorkspace).not.toHaveBeenCalled();
  });

  it('stops when W144 cannot be read', async () => {
    const { controller } = build({
      ...erasedAndUnnamed,
      hub_connections: { data: null, error: { message: 'timeout' } },
    });

    await expect(controller.erase({ workspaceId: WORKSPACE })).rejects.toThrow(
      'W144 check: timeout',
    );
    expect(workspaceService.deleteWorkspace).not.toHaveBeenCalled();
  });
});
