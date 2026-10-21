import { useIsSettingsPage } from '@/navigation/hooks/useIsSettingsPage';

// W144: the drawer follows the page on every size. On a phone Twenty chose it
// with its bottom bar, which is gone; there the settings pages show the
// settings list in the W144 drawer, as on a computer.
export const useIsSettingsDrawer = () => useIsSettingsPage();
