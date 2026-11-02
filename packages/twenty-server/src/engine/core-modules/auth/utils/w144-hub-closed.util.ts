// The CRM closed for one person in their W144 company (owner's answer 5,
// set in W144's Settings, Team, kept on the membership). A request signed in
// with W144 from such a person is refused with its own status and code, which
// the page answers by going to W144's No access screen (w144HubClosed.ts in
// the front). The owner is never closed out.
export class W144HubClosedException extends Error {
  readonly status = 403;
  readonly code = 'HUB_CLOSED';

  constructor() {
    super(
      'The CRM is closed for you in this company. The owner or an administrator opens it in W144, Settings, Team.',
    );
    this.name = 'W144HubClosedException';
  }
}

export const isCrmClosedFor = (
  membership: { role?: string | null; closed_hubs?: unknown } | null,
): boolean =>
  membership !== null &&
  membership.role !== 'owner' &&
  Array.isArray(membership.closed_hubs) &&
  membership.closed_hubs.includes('crm');
