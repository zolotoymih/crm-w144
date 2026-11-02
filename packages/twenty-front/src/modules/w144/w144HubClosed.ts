import { W144_APP_URL } from '@/w144/w144Products';

// The CRM closed for this person in their W144 company (owner's answer 5,
// set in W144's Settings, Team). The server refuses every request signed in
// with W144 with 403 HUB_CLOSED, before any workspace is drawn, so the page
// goes to W144's No access screen for the CRM: the same screen the locked CRM
// row in another product's panel leads to. Installed once, before the app
// draws, so the very first refused request is heard.
const CLOSED = 'HUB_CLOSED';

type Watched = typeof window & { __w144HubClosedWatch?: boolean };

export const watchW144HubClosed = () => {
  const w = window as Watched;
  if (w.__w144HubClosedWatch === true) return;
  w.__w144HubClosedWatch = true;
  const base = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await base(input, init);
    if (res.status === 403) {
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
              j?.errors?.some((e) => e.extensions?.code === CLOSED) === true ||
              j?.error === CLOSED
            ) {
              window.location.assign(`${W144_APP_URL}/no-access/crm`);
            }
          },
        )
        .catch(() => {});
    }
    return res;
  };
};
