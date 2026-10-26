import { useEffect, useState } from 'react';

import { W144_ENGINE_URL } from '@/w144/W144EngineState';

// The W144 company and person, as the engine knows them, asked once a page:
// the profile row shows them, and the company guard keeps the company this
// page was drawn for. Twenty's workspace name is not the company (locally it
// is a demo workspace). While the engine does not answer, there is nothing.
export type W144Me = {
  full_name: string | null;
  company_name: string | null;
};

let asked: Promise<W144Me | null> | null = null;

export const askW144Me = (): Promise<W144Me | null> => {
  asked ??= fetch(`${W144_ENGINE_URL}/api/w144/me`, { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { data?: W144Me } | null) => j?.data ?? null)
    .catch(() => null);
  return asked;
};

export const useW144Me = () => {
  const [me, setMe] = useState<W144Me | null>(null);
  useEffect(() => {
    let live = true;
    void askW144Me().then((m) => {
      if (live && m) setMe(m);
    });
    return () => {
      live = false;
    };
  }, []);
  return me;
};
