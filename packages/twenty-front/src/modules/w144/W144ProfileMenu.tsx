import { useState } from 'react';

import { useAuth } from '@/auth/hooks/useAuth';
import { supportChatState } from '@/client-config/states/supportChatState';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { DropdownMenuSeparator } from '@/ui/layout/dropdown/components/DropdownMenuSeparator';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { useColorScheme } from '@/ui/theme/hooks/useColorScheme';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { W144Chevron } from '@/w144/W144Icons';
import { isNonEmptyString } from '@sniptt/guards';
import { IconLogout, IconMessage } from 'twenty-ui/display';
import { MenuItem, MenuItemSelect } from 'twenty-ui/navigation';

const W144_PROFILE_DROPDOWN_ID = 'w144-profile-menu';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

// The profile row at the bottom of the panel. Its menu carries what the
// workspace switcher used to: the theme, support and signing out (the
// existing W144-wide sign out).
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
  const isSupportChatConfigured =
    supportChat?.supportDriver === 'FRONT' &&
    isNonEmptyString(supportChat.supportFrontChatId);

  return (
    <Dropdown
      dropdownId={W144_PROFILE_DROPDOWN_ID}
      dropdownPlacement="top-start"
      dropdownOffset={{ y: 8 }}
      clickableComponentWidth="100%"
      onClose={() => setShowThemes(false)}
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
        <DropdownContent widthInPixels={204}>
          <DropdownMenuItemsContainer>
            {showThemes ? (
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
