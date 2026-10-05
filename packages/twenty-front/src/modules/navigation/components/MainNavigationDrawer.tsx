import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { NavigationDrawerAiChatContent } from '@/ai/components/NavigationDrawerAiChatContent';
import { MainNavigationDrawerNavigationContent } from '@/navigation/components/MainNavigationDrawerNavigationContent';
import { MainNavigationDrawerTabsRow } from '@/navigation/components/MainNavigationDrawerTabsRow';
import { NavigationDrawer } from '@/ui/navigation/navigation-drawer/components/NavigationDrawer';
import { NavigationDrawerFixedContent } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerFixedContent';
import { NavigationDrawerScrollableContent } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerScrollableContent';
import { navigationDrawerActiveTabState } from '@/ui/navigation/states/navigationDrawerActiveTabState';
import { NAVIGATION_DRAWER_TABS } from '@/ui/navigation/states/navigationDrawerTabs';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { isNavigationDrawerExpandedState } from '@/ui/navigation/states/isNavigationDrawerExpanded';
import { navigationDrawerWidthState } from '@/ui/navigation/states/navigationDrawerWidthState';
import { NAVIGATION_DRAWER_CONSTRAINTS } from '@/ui/layout/resizable-panel/constants/NavigationDrawerConstraints';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { useEffect } from 'react';
import {
  W144CrmGroup,
  W144OtherProducts,
  W144PanelBottom,
  W144PanelTop,
} from '@/w144/W144Panel';

export const MainNavigationDrawer = ({ className }: { className?: string }) => {
  const navigationDrawerActiveTab = useAtomStateValue(
    navigationDrawerActiveTabState,
  );
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const [isNavigationDrawerExpanded, setIsNavigationDrawerExpanded] =
    useAtomState(isNavigationDrawerExpandedState);
  const isMobile = useIsMobile();

  const [navigationDrawerWidth, setNavigationDrawerWidth] = useAtomState(
    navigationDrawerWidthState,
  );

  // W144: the panel stands still on a computer, so a drawer folded or
  // resized earlier (both live in local storage) comes back open at 236
  useEffect(() => {
    if (!isMobile && !isNavigationDrawerExpanded) {
      setIsNavigationDrawerExpanded(true);
    }
  }, [isMobile, isNavigationDrawerExpanded, setIsNavigationDrawerExpanded]);

  useEffect(() => {
    if (navigationDrawerWidth !== NAVIGATION_DRAWER_CONSTRAINTS.default) {
      setNavigationDrawerWidth(NAVIGATION_DRAWER_CONSTRAINTS.default);
    }
  }, [navigationDrawerWidth, setNavigationDrawerWidth]);

  const twentyContent = (
    <>
      <NavigationDrawerFixedContent>
        <MainNavigationDrawerTabsRow />
      </NavigationDrawerFixedContent>

      <NavigationDrawerScrollableContent>
        {navigationDrawerActiveTab ===
        NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY ? (
          <NavigationDrawerAiChatContent />
        ) : (
          <MainNavigationDrawerNavigationContent />
        )}
      </NavigationDrawerScrollableContent>
    </>
  );

  // W144: the drawer is the W144 panel; Twenty's content is the body of the
  // open CRM group. On a phone Twenty's drawer stays as it was.
  return (
    <NavigationDrawer
      className={className}
      title={currentWorkspace?.displayName ?? ''}
    >
      {isNavigationDrawerExpanded && !isMobile ? (
        <div className="w144-panel">
          <W144PanelTop />
          <W144CrmGroup>{twentyContent}</W144CrmGroup>
          <W144OtherProducts />
          <div className="w144-fill" />
          <W144PanelBottom />
        </div>
      ) : (
        twentyContent
      )}
    </NavigationDrawer>
  );
};
