import { type Request } from 'express';

import {
  w144AccessFrom,
  w144MutationFields,
  w144RunsAi,
  w144WritesSomething,
} from 'src/engine/core-modules/auth/utils/w144-access.util';

// The W144 owner's rule for the CRM: the trial runs without AI operations, and
// after it without a plan the workspace is read only, both only with the
// switches on.
const NOW = Date.parse('2026-11-02T12:00:00Z');
const on = { gates: true, limit: true };
const off = { gates: false, limit: false };

const graphql = (query: string, contentType = 'application/json') =>
  ({
    originalUrl: '/graphql',
    method: 'POST',
    headers: { 'content-type': contentType },
    body: { query },
  }) as unknown as Request;

describe('w144AccessFrom', () => {
  it('runs the trial without AI operations', () => {
    expect(
      w144AccessFrom(
        { status: 'trialing', trial_ends_at: '2026-11-10T00:00:00Z' },
        NOW,
        on,
      ),
    ).toEqual({ trial: true, readOnly: false, aiOpen: false });
  });

  it('makes a trial that ended without a plan read only', () => {
    expect(
      w144AccessFrom(
        { status: 'trialing', trial_ends_at: '2026-10-29T00:00:00Z' },
        NOW,
        on,
      ).readOnly,
    ).toBe(true);
  });

  it('closes nothing with the switches off or for a paying company', () => {
    expect(w144AccessFrom({ status: 'read_only' }, NOW, off)).toEqual({
      trial: false,
      readOnly: false,
      aiOpen: true,
    });
    expect(w144AccessFrom({ status: 'active' }, NOW, on).aiOpen).toBe(true);
  });
});

describe('what a request does', () => {
  it('reads the top level fields of a mutation, aliases and arguments aside', () => {
    expect(
      w144MutationFields(
        'mutation Make($a: String) { made: createPerson(data: { name: "x {" }) { id } updateCompany(id: 1) { id } }',
      ),
    ).toEqual(['createPerson', 'updateCompany']);
  });

  it('counts a mutation as a write, signing in and a query as not', () => {
    expect(
      w144WritesSomething(
        graphql('mutation { createPerson(data: {}) { id } }'),
      ),
    ).toBe(true);
    expect(
      w144WritesSomething(
        graphql(
          'mutation Exchange($origin: String!) { exchangeSupabaseSessionForAuthTokens(origin: $origin) { tokens { accessOrWorkspaceAgnosticToken { token } } } }',
        ),
      ),
    ).toBe(false);
    expect(
      w144WritesSomething(graphql('query { people { totalCount } }')),
    ).toBe(false);
    expect(w144WritesSomething(graphql('', 'multipart/form-data; b=1'))).toBe(
      true,
    );
  });

  it('knows the AI chat and text generation', () => {
    expect(
      w144RunsAi(
        graphql(
          'mutation Send { sendChatMessage(threadId: "t") { messageId } }',
        ),
      ),
    ).toBe(true);
    expect(
      w144RunsAi({
        originalUrl: '/rest/ai/generate-text',
        method: 'POST',
        headers: {},
        body: {},
      } as unknown as Request),
    ).toBe(true);
    expect(w144RunsAi(graphql('query { people { totalCount } }'))).toBe(false);
  });
});
