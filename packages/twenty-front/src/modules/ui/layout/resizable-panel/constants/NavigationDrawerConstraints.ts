import { type ResizablePanelConstraints } from '@/ui/layout/resizable-panel/types/ResizablePanelConstraints';

export const NAVIGATION_DRAWER_CONSTRAINTS: ResizablePanelConstraints = {
  // W144: the panel of every product is 236 wide and does not resize
  min: 236,
  max: 236,
  default: 236,
};
