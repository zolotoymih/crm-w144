import { useEffect, useState } from 'react';

import { W144_ENGINE_URL } from '@/w144/W144EngineState';

// What the company's plan opens, asked from the engine like the product rows
// (GET /api/shell/plan, with the shared sign-in cookie). The table lives in
// the engine (bti-engine lib/w144/features.ts); the CRM only reads it.
//
// Nothing is closed yet: while the engine's PLAN_GATES_ON is off, every
// feature answers open. When closing is turned on (TARIFF-BUILD-PLAN Д1), the
// CRM on Launch shows the engine's locked screen (w144LockedUrl('crm')).
// Rules from ux-plan/spec/11-billing.md kept here: until the engine answers
// the state is 'loading' (draw a skeleton, never the content first); when it
// does not answer the state is 'unknown' and nothing closes.

export type W144FeatureRight = {
  code: string;
  name: string;
  area: string;
  depth: 'product' | 'section' | 'capability';
  min_plan: 'launch' | 'operate' | 'scale';
  min_plan_name: string;
  in_plan: boolean;
  open: boolean;
  path: string | null;
};
export type W144PlanRights = {
  gates_on: boolean;
  plan: 'launch' | 'operate' | 'scale';
  plan_name: string;
  status: string;
  features: W144FeatureRight[];
};
export type W144FeatureState = {
  state: 'loading' | 'open' | 'locked' | 'unknown';
  feature: W144FeatureRight | null;
  lockedUrl: string;
};

const KEY = 'w144.plan';
const TTL = 5 * 60_000;

const remembered = (): W144PlanRights | null => {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as {
      at: number;
      rights: W144PlanRights;
    } | null;
    return v !== null && Date.now() - v.at < TTL ? v.rights : null;
  } catch {
    return null;
  }
};

// One request however many places ask.
let asked: Promise<W144PlanRights | null> | null = null;
const askPlan = () => {
  asked ??= fetch(`${W144_ENGINE_URL}/api/shell/plan`, {
    credentials: 'include',
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { data?: W144PlanRights } | null) => j?.data ?? null)
    .catch(() => null);
  return asked;
};

export const w144LockedUrl = (code: string) =>
  `${W144_ENGINE_URL}/billing/locked/${code}`;

export const useW144Plan = (): W144PlanRights | null | 'unknown' => {
  const [rights, setRights] = useState<W144PlanRights | null | 'unknown'>(() =>
    remembered(),
  );
  useEffect(() => {
    let live = true;
    askPlan().then((r) => {
      if (!live) return;
      if (r !== null) {
        try {
          sessionStorage.setItem(
            KEY,
            JSON.stringify({ at: Date.now(), rights: r }),
          );
        } catch {
          // private mode: nothing kept
        }
        setRights(r);
      } else {
        setRights((was) => (was === null ? 'unknown' : was));
      }
    });
    return () => {
      live = false;
    };
  }, []);
  return rights;
};

export const useW144Feature = (code: string): W144FeatureState => {
  const rights = useW144Plan();
  const lockedUrl = w144LockedUrl(code);
  if (rights === null) return { state: 'loading', feature: null, lockedUrl };
  if (rights === 'unknown')
    return { state: 'unknown', feature: null, lockedUrl };
  const feature = rights.features.find((f) => f.code === code) ?? null;
  return {
    state: feature === null || feature.open ? 'open' : 'locked',
    feature,
    lockedUrl,
  };
};
