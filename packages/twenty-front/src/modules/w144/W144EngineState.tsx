import { useCallback, useEffect, useState } from 'react';

import { W144Chevron, W144Icon } from '@/w144/W144Icons';
import { W144_APP_URL, type W144Product } from '@/w144/w144Products';

// What the engine tells the CRM's W144 shell, asked from the browser with the
// shared sign-in cookie: the state of each product row
// (GET /api/shell/products) and the tensions waiting on the CRM
// (GET /api/w144/hub-tensions). While the engine does not answer, the rows
// stay plain and the strip is not drawn: the panel never falls with the data.

export const W144_ENGINE_URL =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : W144_APP_URL;

type W144ProductState = { code: string; connected: boolean; critical: boolean };

// One request however many rows ask; the last answer is kept for the tab.
let asked: Promise<W144ProductState[] | null> | null = null;
const askProducts = () => {
  asked ??= fetch(`${W144_ENGINE_URL}/api/shell/products`, {
    credentials: 'include',
  })
    .then((r) => (r.ok ? r.json() : null))
    .then(
      (j: { data?: { products?: W144ProductState[] } } | null) =>
        j?.data?.products ?? null,
    )
    .catch(() => null);
  return asked;
};

const remembered = (): W144ProductState[] | null => {
  try {
    return JSON.parse(sessionStorage.getItem('w144.products') ?? 'null');
  } catch {
    return null;
  }
};

const useW144ProductState = (code: string) => {
  const pick = (all: W144ProductState[] | null) =>
    all?.find((p) => p.code === code) ?? null;
  const [state, setState] = useState(() => pick(remembered()));
  useEffect(() => {
    let live = true;
    askProducts().then((all) => {
      if (!live || all === null) return;
      try {
        sessionStorage.setItem('w144.products', JSON.stringify(all));
      } catch {
        // private mode: nothing is kept
      }
      setState(all.find((p) => p.code === code) ?? null);
    });
    return () => {
      live = false;
    };
  }, [code]);
  return state;
};

const W144Dot = () => (
  <i className="w144-pdot" aria-label="a critical tension" />
);

// A folded product row with its marks (spec 01-platform, shell items 6 and
// 7): nothing connected mutes it to 40 percent with no dot and its click goes
// to the engine's source screen; a critical tension in it adds a 6 px dot
// beside the chevron. The hover names the product, its domain and its state.
export const W144ProductRow = ({ product }: { product: W144Product }) => {
  const state = useW144ProductState(product.code);
  const off = state !== null && !state.connected;
  const host = product.href.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return (
    <a
      className={`w144-row${off ? ' is-off' : ''}`}
      href={off ? `${W144_APP_URL}/sources/${product.code}` : product.href}
      title={
        state
          ? `${product.name}, ${host}, ${off ? 'not connected' : 'connected'}`
          : `${product.name}, ${host}`
      }
    >
      <span>
        <W144Icon name={product.code} />
        {product.name}
      </span>
      <span className="w144-marks">
        {state?.critical === true && !off && <W144Dot />}
        <W144Chevron />
      </span>
    </a>
  );
};

/** The CRM's own marks on its open group head: only the dot. */
export const W144ProductMarks = ({ code }: { code: string }) => {
  const state = useW144ProductState(code);
  return (
    <span className="w144-marks">
      {state?.critical === true && <W144Dot />}
      <W144Chevron />
    </span>
  );
};

type W144Waiting = { open: number; types: string[] } | { error: string };

// The strip at the top of the work area (spec 01-platform, shell item 11),
// as in the other hubs: how many open tensions the engine counts on the CRM's
// numbers, gold, and a way into them. None waiting draws nothing; when the
// engine could not say, the strip says why and offers to ask again.
export const W144TensionStrip = () => {
  const [state, setState] = useState<W144Waiting | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('w144.waiting.crm') ?? 'null');
    } catch {
      return null;
    }
  });
  const load = useCallback(() => {
    fetch(`${W144_ENGINE_URL}/api/w144/hub-tensions?hub=crm`, {
      credentials: 'include',
    })
      .then(
        async (r): Promise<W144Waiting> => {
          const j = (await r.json().catch(() => null)) as {
            data?: { open: number; types: string[] };
            error?: { message?: string };
          } | null;
          if (r.status === 401) return { error: 'not signed in to the engine' };
          if (!r.ok || !j?.data)
            return {
              error: `the engine answered ${r.status}${j?.error?.message ? `, ${j.error.message}` : ''}`,
            };
          return j.data;
        },
        (): W144Waiting => ({ error: 'the engine did not answer' }),
      )
      .then((next) => {
        setState(next);
        if (!('error' in next)) {
          try {
            sessionStorage.setItem('w144.waiting.crm', JSON.stringify(next));
          } catch {
            // private mode: nothing is kept
          }
        }
      });
  }, []);
  useEffect(load, [load]);
  if (state === null || (!('error' in state) && state.open === 0)) return null;
  return (
    <div className="w144-tstrip">
      <span className="w144-tstrip-label">TENSIONS WAITING ON THIS HUB</span>
      {'error' in state ? (
        <>
          <span className="w144-tstrip-why">not counted, {state.error}</span>
          <button type="button" className="w144-tstrip-open" onClick={load}>
            Try again
          </button>
        </>
      ) : (
        <>
          <b className="w144-tstrip-count">{state.open}</b>
          <a
            className="w144-tstrip-open"
            href={
              state.types.length === 1
                ? `${W144_APP_URL}/tensions/${state.types[0].toLowerCase()}`
                : `${W144_APP_URL}/tensions`
            }
          >
            Open →
          </a>
        </>
      )}
    </div>
  );
};
