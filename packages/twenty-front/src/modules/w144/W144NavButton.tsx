import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const W144_OPEN_NAV_EVENT = 'w144:open-nav';

/** Opens the drawer from elsewhere (Twenty's «Back to Settings» on a phone). */
export const openW144Nav = () =>
  window.dispatchEvent(new Event(W144_OPEN_NAV_EVENT));

// The shell on a phone and an iPad (owner 2026-10-21), as in the other hubs'
// ShellNav. Under 900px the W144 panel leaves the row and waits off the left
// edge; this button in the top bar slides it in over the work area, with a
// scrim behind it. A tap on the scrim, on a link in the panel, a new page,
// Esc, or the window growing past 900 closes it. Layout: W144Shell.css
// «the shell on a phone and an iPad».
export const W144NavButton = () => {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(W144_OPEN_NAV_EVENT, onOpen);
    return () => window.removeEventListener(W144_OPEN_NAV_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const layout = button.current?.closest('.w144-layout');
    if (!layout) return;
    layout.classList.toggle('is-nav-open', open);
    if (!open) return;
    const panel = layout.querySelector('.w144-navwrap');
    const scrim = layout.querySelector('.w144-navscrim');
    const close = () => setOpen(false);
    const onPanel = (event: Event) => {
      if ((event.target as Element).closest('a')) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        button.current?.focus();
      }
    };
    const onWide = () => {
      if (window.innerWidth >= 900) close();
    };
    panel?.addEventListener('click', onPanel);
    scrim?.addEventListener('click', close);
    // capture: Twenty's own hotkeys stop Esc before it bubbles up
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onWide);
    return () => {
      panel?.removeEventListener('click', onPanel);
      scrim?.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onWide);
    };
  }, [open]);

  return (
    <button
      ref={button}
      type="button"
      className={`w144-navbtn${open ? ' is-open' : ''}`}
      aria-expanded={open}
      aria-label={open ? 'Close menu' : 'Open menu'}
      onClick={() => setOpen((isOpen) => !isOpen)}
    >
      <i />
      <i />
    </button>
  );
};
