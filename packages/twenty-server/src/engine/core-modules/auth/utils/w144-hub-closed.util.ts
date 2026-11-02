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

// The CRM is a product of the Operate plan and up (the W144 engine's feature
// table, lib/w144/features.ts; spec 11-billing «На LAUNCH закрыты CRM,
// Финансы и Операции»). The plan whose features are open is the engine's
// (lib/w144/rights.ts openPlanOf): the trial opens the Operate set, a chosen
// plan its own, a plan the table does not know is not closed. The plan comes
// before the person, so the owner is closed out too. Only with PLAN_GATES_ON,
// like the engine and the other products.
const PLAN_RANK: Record<string, number> = { launch: 0, operate: 1, scale: 2 };
const PLAN_NAME: Record<string, string> = {
  launch: 'Launch',
  operate: 'Operate',
  scale: 'Scale',
};

export const crmClosedByPlan = (
  billing: { plan?: string | null; status?: string | null } | null,
  gates = process.env.PLAN_GATES_ON === 'true',
): string | null => {
  if (!gates) return null;
  const status = String(billing?.status ?? 'trialing');
  const plan =
    status !== 'trialing' && billing?.plan && billing.plan in PLAN_RANK
      ? billing.plan
      : 'operate';

  return PLAN_RANK[plan] >= PLAN_RANK.operate ? null : plan;
};

// The engine's answer for a closed product (rights.ts planDenied): the page
// goes to W144's locked screen for the CRM (w144HubClosed.ts in the front).
export class W144NotInPlanException extends Error {
  readonly status = 403;
  readonly code = 'NOT_IN_PLAN';

  constructor(plan: string) {
    super(
      `CRM opens on the Operate plan; this company is on ${PLAN_NAME[plan] ?? plan}. The owner changes the plan in W144, Billing.`,
    );
    this.name = 'W144NotInPlanException';
  }
}
