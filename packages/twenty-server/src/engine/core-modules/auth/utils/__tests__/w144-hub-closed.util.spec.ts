import {
  crmClosedByPlan,
  isCrmClosedFor,
  W144HubClosedException,
  W144NotInPlanException,
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

// The CRM opens on Operate and up; Launch closes it for everyone, only with
// the plan switch on.
describe('crmClosedByPlan', () => {
  it('closes it on Launch with the switch on', () => {
    expect(crmClosedByPlan({ plan: 'launch', status: 'active' }, true)).toBe(
      'launch',
    );
  });

  it('keeps it open on Operate and Scale', () => {
    expect(crmClosedByPlan({ plan: 'operate', status: 'active' }, true)).toBe(
      null,
    );
    expect(crmClosedByPlan({ plan: 'scale', status: 'active' }, true)).toBe(
      null,
    );
  });

  it('keeps it open in the trial, which opens the Operate set', () => {
    expect(crmClosedByPlan({ plan: 'launch', status: 'trialing' }, true)).toBe(
      null,
    );
    expect(crmClosedByPlan(null, true)).toBe(null);
  });

  it('keeps it open with the switch off', () => {
    expect(crmClosedByPlan({ plan: 'launch', status: 'active' }, false)).toBe(
      null,
    );
  });

  it('answers with the code the page turns into the locked screen', () => {
    const error = new W144NotInPlanException('launch');

    expect(error.status).toBe(403);
    expect(error.code).toBe('NOT_IN_PLAN');
    expect(error.message).toContain('Launch');
  });
});
