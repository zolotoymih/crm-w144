import { useEffect } from 'react';

// Where the work area starts under the W144 top bar and the tensions strip,
// kept in --w144-work-top on the page. On a phone Twenty opens its command
// menu over the whole screen and leaves its own close button where the page
// header was; the strip moves that header down, so the menu starts at the
// work area to keep the close button on the menu's top bar
// (W144Shell.css, «a finger instead of a mouse»).
export const useW144WorkTop = () => {
  useEffect(() => {
    const page = document.querySelector('.w144-workpage');
    if (page === null) return;
    const root = document.documentElement;
    const set = () =>
      root.style.setProperty(
        '--w144-work-top',
        `${Math.round(page.getBoundingClientRect().top)}px`,
      );
    set();
    const observer = new ResizeObserver(set);
    observer.observe(page);
    window.addEventListener('resize', set);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', set);
      root.style.removeProperty('--w144-work-top');
    };
  }, []);
};
