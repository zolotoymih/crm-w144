import { useEffect, useRef } from 'react';

import { W144_APP_URL } from '@/w144/w144Products';
import { W144Mark } from '@/w144/W144Mark';
import { W144CompanyGuard } from '@/w144/W144CompanyGuard';
import { W144NavButton } from '@/w144/W144NavButton';
import { useW144WorkTop } from '@/w144/useW144WorkTop';

// The W144 top bar, 56 high, the same on every product: the wordmark leads
// to the dashboard of the engine, the search pill on the right sends one query
// over every product to the engine's search page. No ⌘K hint here: in the
// CRM that key opens the CRM's own search. Under 900px the menu button
// leads the bar and opens the panel as a drawer (W144NavButton). On a phone
// the pill is a round icon that opens across the bar while the field has
// focus (W144Shell.css); a tap anywhere else folds it, the same way the menus
// close (pointerdown: Safari sends no click for a tap on plain text).
export const W144TopBar = () => {
  useW144WorkTop();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        document.activeElement === inputRef.current &&
        formRef.current?.contains(event.target as Node) !== true
      ) {
        inputRef.current?.blur();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);
  return (
    <header className="w144-topbar">
      <W144NavButton />
      <a className="w144-wordmark" href={`${W144_APP_URL}/dashboard`}>
        <W144Mark height={22} />
        W144
      </a>
      <form
        ref={formRef}
        className="w144-search"
        action={`${W144_APP_URL}/search`}
        method="get"
        role="search"
      >
        <span className="w144-search-icon">&#8981;</span>
        <input
          ref={inputRef}
          className="w144-search-input"
          name="q"
          placeholder="Search every product"
          aria-label="Search every product"
          autoComplete="off"
          enterKeyHint="search"
        />
      </form>
      <W144CompanyGuard />
    </header>
  );
};
