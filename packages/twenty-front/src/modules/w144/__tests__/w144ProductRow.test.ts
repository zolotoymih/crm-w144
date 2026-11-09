import { type W144PlanRights } from '@/w144/W144PlanState';
import { w144ProductRowView } from '@/w144/w144ProductRow';

// The plan's diamond on the panel's product rows (w144ProductRow.ts;
// 11-billing, «Три состояния знака на рельсе»): a product the company's plan
// does not open is dimmed with the diamond and leads to the engine's locked
// screen, before the role and the source; with the engine's PLAN_GATES_ON
// off, or no answer from it, nothing changes.

const E = 'https://engine.test';
const HREF = 'https://ops.test';
// the engine's answer for a company on Launch: open is false only while the
// flag is on
const rights = (gates: boolean): W144PlanRights => ({
  gates_on: gates,
  plan: 'launch',
  plan_name: 'Launch',
  status: 'active',
  features: [
    {
      code: 'operations',
      name: 'Operations',
      area: 'operations',
      depth: 'product',
      min_plan: 'operate',
      min_plan_name: 'Operate',
      in_plan: false,
      open: !gates,
      path: null,
    },
    {
      code: 'web',
      name: 'Web',
      area: 'web',
      depth: 'product',
      min_plan: 'launch',
      min_plan_name: 'Launch',
      in_plan: true,
      open: true,
      path: null,
    },
    {
      code: 'hr_hiring',
      name: 'Hiring',
      area: 'hr',
      depth: 'section',
      min_plan: 'scale',
      min_plan_name: 'Scale',
      in_plan: false,
      open: !gates,
      path: '/hiring',
    },
  ],
});
const connected = { code: 'operations', connected: true, critical: true };

describe('a product row of the panel', () => {
  it('shows the diamond and leads to the locked screen when the plan does not open the product, before the role and the source', () => {
    expect(
      w144ProductRowView('operations', HREF, E, connected, rights(true)),
    ).toEqual({
      to: `${E}/billing/locked/operations`,
      cls: ' is-plan',
      word: 'part of the Operate plan',
      mark: 'diamond',
      plan: 'Operate',
    });
    expect(
      w144ProductRowView(
        'operations',
        HREF,
        E,
        { ...connected, closed: true },
        rights(true),
      ).mark,
    ).toBe('diamond');
    expect(
      w144ProductRowView(
        'operations',
        HREF,
        E,
        { ...connected, connected: false },
        rights(true),
      ).to,
    ).toBe(`${E}/billing/locked/operations`);
    expect(
      w144ProductRowView(
        'web',
        'https://web.test',
        E,
        { code: 'web', connected: true, critical: false },
        rights(true),
      ).mark,
    ).toBeNull();
  });

  it("is as before with the engine's PLAN_GATES_ON off, or without its answer", () => {
    const before = {
      to: HREF,
      cls: '',
      word: 'connected',
      mark: 'dot',
      plan: null,
    };
    expect(
      w144ProductRowView('operations', HREF, E, connected, rights(false)),
    ).toEqual(before);
    expect(w144ProductRowView('operations', HREF, E, connected, null)).toEqual(
      before,
    );
    expect(
      w144ProductRowView('operations', HREF, E, connected, 'unknown'),
    ).toEqual(before);
    expect(
      w144ProductRowView(
        'operations',
        HREF,
        E,
        { ...connected, closed: true },
        rights(false),
      ).to,
    ).toBe(`${E}/no-access/operations`);
    expect(
      w144ProductRowView(
        'operations',
        HREF,
        E,
        { ...connected, connected: false },
        rights(false),
      ).to,
    ).toBe(`${E}/sources/operations`);
    expect(
      w144ProductRowView('operations', HREF, E, null, null).word,
    ).toBeNull();
  });
});
