import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { openW144CompanyHere, W144_COMPANY_CHANNEL } from '@/w144/w144Company';
import { useW144Me } from '@/w144/w144Me';

// A window left on a company the person no longer works in (the engine's
// CompanyGuard, the same for the CRM). The CRM server refuses a request from
// such a page with 409 COMPANY_SWITCHED (it still carries the session of the
// workspace it was drawn for), so nothing is read or written in the other
// company's CRM from it. This says so, with the way to open the company the
// person works in now; a page refused before it drew any workspace opens it
// at once. A switch in another window of the CRM is heard straight away.
const SWITCHED = 'COMPANY_SWITCHED';
const RELOADED = 'w144.company-reload';

type Guarded = typeof window & {
  __w144CrmFetch?: typeof fetch;
  __w144Refused?: () => void;
};

export const W144CompanyGuard = () => {
  const me = useW144Me();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const drawn = currentWorkspace?.id ?? null;
  // undefined: nothing to say; null: another company, its name unknown
  const [moved, setMoved] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const w = window as Guarded;
    w.__w144Refused = () => {
      if (drawn) {
        setMoved((m) => (m === undefined ? null : m));
        return;
      }
      // nothing drawn yet: open the company now, once (a second refusal
      // right after would mean the reload did not help; then the band says it)
      let again = false;
      try {
        again =
          Date.now() - Number(sessionStorage.getItem(RELOADED) ?? 0) < 15000;
        sessionStorage.setItem(RELOADED, String(Date.now()));
      } catch {
        /* storage off: open it anyway */
      }
      if (again) setMoved(null);
      else openW144CompanyHere();
    };
    if (!w.__w144CrmFetch) {
      const base = window.fetch.bind(window);
      w.__w144CrmFetch = base;
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const res = await base(input, init);
        if (res.status === 409) {
          res
            .clone()
            .json()
            .then(
              (
                j: {
                  errors?: { extensions?: { code?: string } }[];
                  error?: string;
                } | null,
              ) => {
                if (
                  j?.errors?.some((e) => e.extensions?.code === SWITCHED) ||
                  j?.error === SWITCHED
                ) {
                  (window as Guarded).__w144Refused?.();
                }
              },
            )
            .catch(() => {});
        }
        return res;
      };
    }
  }, [drawn]);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(W144_COMPANY_CHANNEL);
      // the window that switched says which company it opened
      channel.onmessage = (
        event: MessageEvent<{ id?: string; name?: string }>,
      ) => {
        const name = event.data?.name ?? null;
        if (drawn && (!me || name !== me.company_name)) setMoved(name);
      };
    } catch {
      /* an old browser: the server still refuses a stale request */
    }
    return () => channel?.close();
  }, [drawn, me]);

  return (
    <>
      {moved !== undefined &&
        createPortal(
          <div className="w144-moved" role="status">
            <span>
              You opened {moved ?? 'another company'} in another window. This
              window still shows{' '}
              {me?.company_name ?? 'the company it was opened on'}, so changes
              made here are refused until it is reloaded.
            </span>
            <button
              type="button"
              className="w144-moved-open"
              onClick={openW144CompanyHere}
            >
              Open {moved ?? 'it'} here
            </button>
          </div>,
          document.body,
        )}
    </>
  );
};
