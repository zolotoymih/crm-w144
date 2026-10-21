import { W144_APP_URL } from '@/w144/w144Products';
import { W144Mark } from '@/w144/W144Mark';
import { W144NavButton } from '@/w144/W144NavButton';

// The W144 top bar, 56 high, the same on every product: the wordmark leads
// to the dashboard of the engine, the search pill on the right sends one query
// over every product to the engine's search page. No ⌘K hint here: in the
// CRM that key opens the CRM's own search. Under 900px the menu button
// leads the bar and opens the panel as a drawer (W144NavButton).
export const W144TopBar = () => {
  return (
    <header className="w144-topbar">
      <W144NavButton />
      <a className="w144-wordmark" href={`${W144_APP_URL}/dashboard`}>
        <W144Mark height={22} />
        W144
      </a>
      <form
        className="w144-search"
        action={`${W144_APP_URL}/search`}
        method="get"
        role="search"
      >
        <span className="w144-search-icon">&#8981;</span>
        <input
          className="w144-search-input"
          name="q"
          placeholder="Search every product"
          aria-label="Search every product"
          autoComplete="off"
        />
      </form>
    </header>
  );
};
