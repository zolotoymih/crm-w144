import { useMediaQuery } from 'react-responsive';

// A screen without a mouse (a phone, an iPad, an iPad Pro with a finger):
// no hover, and no keyboard to press the key hints Twenty draws beside its
// commands. Twenty hides those hints by width only (768 and under), so an
// iPad showed «⌘K» and «G then S» it cannot press.
export const useW144NoHover = () => useMediaQuery({ query: '(hover: none)' });
