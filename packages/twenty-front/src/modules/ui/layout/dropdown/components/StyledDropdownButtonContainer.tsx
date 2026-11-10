import { themeCssVariables } from 'twenty-ui/theme-constants';
import { styled } from '@linaria/react';

type StyledDropdownButtonProps = {
  isUnfolded: boolean;
  isActive?: boolean;
  transparentBackground?: boolean;
};

export const StyledDropdownButtonContainer = styled.div<StyledDropdownButtonProps>`
  align-items: center;
  background: ${({ isUnfolded, transparentBackground }) =>
    transparentBackground
      ? 'none'
      : isUnfolded
        ? themeCssVariables.background.transparent.light
        : themeCssVariables.background.primary};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ isActive }) =>
    isActive
      ? themeCssVariables.color.blue
      : themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: flex;

  padding: ${themeCssVariables.spacing[1]};
  padding-left: ${themeCssVariables.spacing[1]};

  padding-right: ${themeCssVariables.spacing[2]};
  user-select: none;

  &:hover {
    background: ${({ isUnfolded, transparentBackground }) =>
      transparentBackground
        ? 'transparent'
        : isUnfolded
          ? themeCssVariables.background.transparent.medium
          : themeCssVariables.background.transparent.light};
  }

  /* W144: a finger needs 32px, the button keeps its 24px look; its hit
     area grows 4px above and below on a touch screen */
  @media (hover: none) {
    position: relative;

    &::after {
      content: '';
      inset: -4px 0;
      position: absolute;
    }
  }
`;
