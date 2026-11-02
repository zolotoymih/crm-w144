import {
  isCrmClosedFor,
  W144HubClosedException,
} from 'src/engine/core-modules/auth/utils/w144-hub-closed.util';

// The CRM closed for one person in their W144 company (owner's answer 5): the
// membership's list of closed products decides, and the owner is never closed
// out.
describe('isCrmClosedFor', () => {
  it('closes the CRM when the list names it', () => {
    expect(isCrmClosedFor({ role: 'member', closed_hubs: ['hr', 'crm'] })).toBe(
      true,
    );
  });

  it('keeps it open when the list names other products only', () => {
    expect(
      isCrmClosedFor({ role: 'admin', closed_hubs: ['finance', 'hr'] }),
    ).toBe(false);
  });

  it('keeps it open with an empty list or no membership row', () => {
    expect(isCrmClosedFor({ role: 'viewer', closed_hubs: [] })).toBe(false);
    expect(isCrmClosedFor(null)).toBe(false);
  });

  it('never closes it for the owner', () => {
    expect(isCrmClosedFor({ role: 'owner', closed_hubs: ['crm'] })).toBe(false);
  });
});

describe('W144HubClosedException', () => {
  it('carries the status and code the page answers', () => {
    const error = new W144HubClosedException();

    expect(error.status).toBe(403);
    expect(error.code).toBe('HUB_CLOSED');
  });
});
