import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { PAGE_BAR_MIN_HEIGHT } from '@/ui/layout/page/constants/PageBarMinHeight';
import { isNavigationDrawerExpandedState } from '@/ui/navigation/states/isNavigationDrawerExpanded';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const StyledContainer = styled.div<{ isExpanded: boolean }>`
  align-items: ${({ isExpanded }) => (isExpanded ? 'center' : 'flex-start')};
  display: flex;
  flex-direction: ${({ isExpanded }) => (isExpanded ? 'row' : 'column')};
  gap: ${({ isExpanded }) => (isExpanded ? '0' : themeCssVariables.spacing[4])};
  min-height: ${PAGE_BAR_MIN_HEIGHT}px;
  padding-right: ${themeCssVariables.spacing[2]};
  transition: gap calc(${themeCssVariables.animation.duration.normal} * 1s) ease;
  user-select: none;
`;

type NavigationDrawerHeaderProps = {
  showCollapseButton: boolean;
};

export const NavigationDrawerHeader = (
  // W144: kept so NavigationDrawer's call stays as upstream has it
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _props: NavigationDrawerHeaderProps,
) => {
  const isNavigationDrawerExpanded = useAtomStateValue(
    isNavigationDrawerExpandedState,
  );

  // W144: the workspace switcher, the search button and the collapse button
  // are gone. A company has one workspace, search stays on Cmd K, and the W144
  // panel stands still in every product, so it does not fold away here either.
  return (
    <StyledContainer
      isExpanded={isNavigationDrawerExpanded}
      className="w144-drawer-header"
    />
  );
};
