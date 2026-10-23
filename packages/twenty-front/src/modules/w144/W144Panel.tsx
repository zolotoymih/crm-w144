import { type ReactNode, useEffect, useState } from 'react';

import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import {
  W144_ENGINE_URL,
  W144ProductMarks,
  W144ProductRow,
} from '@/w144/W144EngineState';
import { W144Icon } from '@/w144/W144Icons';
import { W144ProfileMenu } from '@/w144/W144ProfileMenu';
import { W144_APP_URL, W144_PRODUCTS } from '@/w144/w144Products';

// The W144 panel around Twenty's drawer (frame «CRM, Companies, in the W144
// shell»): Home, MENU, the six products with CRM open, and at the bottom
// Notifications and the profile. Twenty's own items stay inside the CRM group
// as Twenty draws them.

export const W144PanelTop = () => (
  <div className="w144-panel-top">
    <a className="w144-row is-framed" href={`${W144_APP_URL}/`}>
      <span>
        <W144Icon name="home" />
        Home
      </span>
    </a>
    <div className="w144-gap-18" />
    <div className="w144-divider" />
    <div className="w144-gap-16" />
    <div className="w144-label">MENU</div>
    <div className="w144-gap-10" />
  </div>
);

/** The open CRM group: its head row, then Twenty's drawer content as its body. */
export const W144CrmGroup = ({ children }: { children: ReactNode }) => (
  <div className="w144-group">
    <a className="w144-row is-head" href="/">
      <span>
        <W144Icon name="crm" />
        CRM
      </span>
      <W144ProductMarks code="crm" />
    </a>
    <div className="w144-group-body">{children}</div>
  </div>
);

/** The products after CRM, each leading to its own domain, with its marks. */
export const W144OtherProducts = () => (
  <div className="w144-products">
    {W144_PRODUCTS.filter((product) => product.code !== 'crm').map(
      (product) => (
        <W144ProductRow key={product.code} product={product} />
      ),
    )}
  </div>
);

// The engine's unread notifications for the count on the Notifications row.
// The engine answers across origins with the shared sign-in cookie; while
// it does not answer, the row simply has no count.

const useW144Unread = () => {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`${W144_ENGINE_URL}/api/w144/notifications/unread`, {
        credentials: 'include',
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (live && j?.data) setUnread(j.data.count ?? 0);
        })
        .catch(() => {});
    load();
    const t = window.setInterval(load, 60000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, []);
  return unread;
};

// The W144 company and person, as the engine knows them. Twenty's workspace
// name is not the company (locally it is a demo workspace), so the profile
// row shows nothing under the name until the engine answers.
const useW144Me = () => {
  const [me, setMe] = useState<{
    full_name: string | null;
    company_name: string | null;
  } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${W144_ENGINE_URL}/api/w144/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live && j?.data) setMe(j.data);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return me;
};

export const W144PanelBottom = () => {
  const unread = useW144Unread();
  const me = useW144Me();
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const twentyName = [
    currentWorkspaceMember?.name?.firstName,
    currentWorkspaceMember?.name?.lastName,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="w144-panel-bottom">
      <div className="w144-divider" />
      <div className="w144-gap-14" />
      <a className="w144-row is-framed" href={`${W144_APP_URL}/notifications`}>
        <span>
          <W144Icon name="bell" />
          Notifications
        </span>
        {unread > 0 && <span className="w144-count">{unread}</span>}
      </a>
      <div className="w144-gap-10" />
      <W144ProfileMenu
        name={
          me?.full_name || twentyName || currentWorkspaceMember?.userEmail || ''
        }
        company={me?.company_name ?? ''}
      />
    </div>
  );
};
