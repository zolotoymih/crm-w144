import { clearSessionLocalStorageKeys } from '@/auth/utils/clearSessionLocalStorageKeys';
import { cookieStorage } from '~/utils/cookie-storage';

// One person can be in several W144 companies (the engine's migration 035,
// owner decision 159) and works in one at a time. The CRM server opens the
// workspace of that company on every request; this page holds the Twenty
// session of the workspace it was drawn for.

/** Every window of the CRM in this browser hears a switch made in one of them. */
export const W144_COMPANY_CHANNEL = 'w144-company';

/** A company the person is in, as the engine's GET /api/shell/companies lists it. */
export type W144Company = { id: string; name: string; role: string };

/**
 * Opens the company the person works in now in this window: the Twenty
 * session of the workspace drawn here goes, and the CRM loads again, signs in
 * with W144 and opens that company's workspace (set up for it the first time
 * its owner or an admin opens the CRM).
 */
export const openW144CompanyHere = () => {
  cookieStorage.removeItem('tokenPair');
  clearSessionLocalStorageKeys();
  window.location.href = '/';
};
