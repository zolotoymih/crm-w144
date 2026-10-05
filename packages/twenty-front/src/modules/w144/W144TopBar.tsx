import { W144_APP_URL } from '@/w144/w144Products';

// The W144 top bar, 56 high, the same on every product: the wordmark leads
// to the dashboard of the engine.
export const W144TopBar = () => {
  return (
    <header className="w144-topbar">
      <a className="w144-wordmark" href={`${W144_APP_URL}/dashboard`}>
        W144
      </a>
    </header>
  );
};
