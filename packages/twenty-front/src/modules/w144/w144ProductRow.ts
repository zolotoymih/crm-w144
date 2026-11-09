import { type W144ProductState } from '@/w144/W144EngineState';
import { type W144PlanRights } from '@/w144/W144PlanState';

// What a folded product row of the panel shows, from the engine's two answers
// (GET /api/shell/products and GET /api/shell/plan), in the order of
// 11-billing, «Порядок важности»: the plan before the role, the role before
// the source. Pure, for W144EngineState.tsx and the tests; the same rule as
// the other products' copies of the shell.
export type W144RowView = {
  // where a click goes
  to: string;
  // the row's own class: is-plan dims the words and keeps the diamond
  // bright, is-off dims the row
  cls: '' | ' is-plan' | ' is-off';
  // the state word of the hover, after the name and the domain; null while
  // the engine has not answered
  word: string | null;
  mark: 'diamond' | 'lock' | 'dot' | null;
  // the plan that opens the product, when the company's plan does not
  plan: string | null;
};

export const w144ProductRowView = (
  code: string,
  href: string,
  engine: string,
  state: W144ProductState | null,
  rights: W144PlanRights | null | 'unknown',
): W144RowView => {
  // only while the engine's PLAN_GATES_ON is on (then `open` can be false);
  // a missing or failed answer closes nothing
  const right =
    rights !== null && rights !== 'unknown' && rights.gates_on
      ? rights.features.find((f) => f.code === code && f.depth === 'product')
      : undefined;
  const plan = right !== undefined && !right.open ? right.min_plan_name : null;
  if (plan !== null)
    return {
      to: `${engine}/billing/locked/${code}`,
      cls: ' is-plan',
      word: `part of the ${plan} plan`,
      mark: 'diamond',
      plan,
    };
  if (state?.closed === true)
    return {
      to: `${engine}/no-access/${code}`,
      cls: ' is-off',
      word: 'closed for you',
      mark: 'lock',
      plan: null,
    };
  if (state !== null && !state.connected)
    return {
      to: `${engine}/sources/${code}`,
      cls: ' is-off',
      word: 'not connected',
      mark: null,
      plan: null,
    };
  return {
    to: href,
    cls: '',
    word: state !== null ? 'connected' : null,
    mark: state?.critical === true ? 'dot' : null,
    plan: null,
  };
};
