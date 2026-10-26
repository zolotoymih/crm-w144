import { useEffect, useState } from 'react';

import { useAuth } from '@/auth/hooks/useAuth';
import { supportChatState } from '@/client-config/states/supportChatState';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { DropdownMenuSectionLabel } from '@/ui/layout/dropdown/components/DropdownMenuSectionLabel';
import { DropdownMenuSeparator } from '@/ui/layout/dropdown/components/DropdownMenuSeparator';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { useColorScheme } from '@/ui/theme/hooks/useColorScheme';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import {
  openW144CompanyHere,
  W144_COMPANY_CHANNEL,
  type W144Company,
} from '@/w144/w144Company';
import { W144_ENGINE_URL } from '@/w144/W144EngineState';
import { W144Chevron } from '@/w144/W144Icons';
import { isNonEmptyString } from '@sniptt/guards';
import {
  IconBuildingSkyscraper,
  IconLayoutGrid,
  IconLogout,
  IconMessage,
} from 'twenty-ui/display';
import { MenuItem, MenuItemSelect } from 'twenty-ui/navigation';

const W144_PROFILE_DROPDOWN_ID = 'w144-profile-menu';

const ROLE: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

// Every company the person is in and the one open now (the engine's GET
// /api/shell/companies, owner decision 159, question 13), asked once a page.
const useW144Companies = () => {
  const [state, setState] = useState<{
    open: string | null;
    companies: W144Company[];
  } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${W144_ENGINE_URL}/api/shell/companies`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          j: {
            data?: { company_id: string; companies: W144Company[] };
          } | null,
        ) => {
          if (live && j?.data)
            setState({ open: j.data.company_id, companies: j.data.companies });
        },
      )
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return state;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

// The profile row at the bottom of the panel. Its menu carries what the
// workspace switcher used to: the company (for a person in several, the
// switch between them, for all six products), the theme, support and
// signing out (the existing W144-wide sign out).
export const W144ProfileMenu = ({
  name,
  company,
}: {
  name: string;
  company: string;
}) => {
  const { signOut } = useAuth();
  const { closeDropdown } = useCloseDropdown();
  const { colorScheme, colorSchemeList, setColorScheme } = useColorScheme();
  const supportChat = useAtomStateValue(supportChatState);
  const [showThemes, setShowThemes] = useState(false);
  const [showCompanies, setShowCompanies] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveFailed, setMoveFailed] = useState<string | null>(null);
  const portfolio = useW144Companies();
  const openCompany = portfolio?.companies.find((c) => c.id === portfolio.open);

  // The engine switches the company for all six products; the other CRM
  // windows hear it (W144CompanyGuard) and this one loads again in it.
  const switchTo = async (to: W144Company) => {
    if (moving || to.id === portfolio?.open) return;
    setMoving(to.id);
    setMoveFailed(null);
    try {
      const r = await fetch(`${W144_ENGINE_URL}/api/w144/company/switch`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: to.id }),
      });
      const j = (await r.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!r.ok) {
        throw new Error(j?.error?.message ?? `the engine answered ${r.status}`);
      }
      try {
        new BroadcastChannel(W144_COMPANY_CHANNEL).postMessage({
          id: to.id,
          name: to.name,
        });
      } catch {
        /* an old browser: the other windows find out on their next request */
      }
      openW144CompanyHere();
    } catch (e) {
      setMoving(null);
      setMoveFailed(
        e instanceof Error
          ? e.message
          : 'the switch did not go through, try again',
      );
    }
  };
  const isSupportChatConfigured =
    supportChat?.supportDriver === 'FRONT' &&
    isNonEmptyString(supportChat.supportFrontChatId);

  return (
    <Dropdown
      dropdownId={W144_PROFILE_DROPDOWN_ID}
      dropdownPlacement="top-start"
      dropdownOffset={{ y: 8 }}
      clickableComponentWidth="100%"
      onClose={() => {
        setShowThemes(false);
        setShowCompanies(false);
      }}
      clickableComponent={
        <button type="button" className="w144-row is-framed is-profile">
          <span>
            <span className="w144-avatar">{initials(name)}</span>
            <span className="w144-profile-text">
              <span className="w144-profile-name">{name}</span>
              <span className="w144-profile-company">{company}</span>
            </span>
          </span>
          <W144Chevron />
        </button>
      }
      dropdownComponents={
        <DropdownContent widthInPixels={showCompanies ? 248 : 204}>
          <DropdownMenuItemsContainer>
            {showCompanies && portfolio ? (
              <>
                <DropdownMenuSectionLabel
                  label={`Your companies, ${portfolio.companies.length}`}
                />
                {portfolio.companies.map((c) => (
                  <MenuItemSelect
                    key={c.id}
                    LeftIcon={IconBuildingSkyscraper}
                    text={moving === c.id ? `Opening ${c.name}` : c.name}
                    selected={c.id === portfolio.open}
                    contextualText={
                      c.id === portfolio.open
                        ? 'open now'
                        : (ROLE[c.role] ?? c.role)
                    }
                    contextualTextPosition="right"
                    disabled={moving !== null}
                    onClick={() => void switchTo(c)}
                  />
                ))}
                <MenuItem
                  LeftIcon={IconLayoutGrid}
                  text="All your companies"
                  contextualText="one screen"
                  contextualTextPosition="right"
                  onClick={() => {
                    window.location.href = `${W144_ENGINE_URL}/portfolio`;
                  }}
                />
                {moveFailed && (
                  <span className="w144-pm-err">{moveFailed}</span>
                )}
              </>
            ) : showThemes ? (
              colorSchemeList.map((scheme) => (
                <MenuItemSelect
                  key={scheme.id}
                  LeftIcon={scheme.icon}
                  text={scheme.id}
                  selected={scheme.id === colorScheme}
                  onClick={() => {
                    void setColorScheme(scheme.id);
                    setShowThemes(false);
                    closeDropdown(W144_PROFILE_DROPDOWN_ID);
                  }}
                />
              ))
            ) : (
              <>
                {portfolio && portfolio.companies.length > 1 && (
                  <MenuItem
                    LeftIcon={IconBuildingSkyscraper}
                    text={`Company · ${openCompany?.name ?? company}`}
                    hasSubMenu
                    onClick={() => setShowCompanies(true)}
                  />
                )}
                <MenuItem
                  LeftIcon={
                    colorSchemeList.find(({ id }) => id === colorScheme)?.icon
                  }
                  text={`Theme · ${colorScheme}`}
                  hasSubMenu
                  onClick={() => setShowThemes(true)}
                />
                {isSupportChatConfigured && (
                  <MenuItem
                    LeftIcon={IconMessage}
                    text="Support"
                    onClick={() => {
                      window.FrontChat?.('show');
                      closeDropdown(W144_PROFILE_DROPDOWN_ID);
                    }}
                  />
                )}
                <DropdownMenuSeparator />
                <MenuItem
                  LeftIcon={IconLogout}
                  text="Log out"
                  onClick={signOut}
                />
              </>
            )}
          </DropdownMenuItemsContainer>
        </DropdownContent>
      }
    />
  );
};
