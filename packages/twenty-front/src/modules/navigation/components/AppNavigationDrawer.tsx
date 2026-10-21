import { useEffect } from 'react';

import { useIsSettingsDrawer } from '@/navigation/hooks/useIsSettingsDrawer';

import { MainNavigationDrawer } from '@/navigation/components/MainNavigationDrawer';
import { SettingsNavigationDrawer } from '@/navigation/components/SettingsNavigationDrawer';
import { isNavigationDrawerExpandedState } from '@/ui/navigation/states/isNavigationDrawerExpanded';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';

export type AppNavigationDrawerProps = {
  className?: string;
};

export const AppNavigationDrawer = ({
  className,
}: AppNavigationDrawerProps) => {
  const isSettingsDrawer = useIsSettingsDrawer();
  const [isNavigationDrawerExpanded, setIsNavigationDrawerExpanded] =
    useAtomState(isNavigationDrawerExpandedState);

  // W144: the panel stands still on a computer, so a drawer folded earlier
  // (it lives in local storage) comes back open, in the CRM and in settings.
  // On a phone it stays open as well: there the whole panel is a drawer
  // behind the menu button of the top bar (W144NavButton), which opens and
  // closes it instead of Twenty's expanded state.
  useEffect(() => {
    if (!isNavigationDrawerExpanded) {
      setIsNavigationDrawerExpanded(true);
    }
  }, [isNavigationDrawerExpanded, setIsNavigationDrawerExpanded]);

  return isSettingsDrawer ? (
    <SettingsNavigationDrawer className={className} />
  ) : (
    <MainNavigationDrawer className={className} />
  );
};
