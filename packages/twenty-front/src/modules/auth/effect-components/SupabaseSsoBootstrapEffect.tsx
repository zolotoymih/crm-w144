import { useMutation } from '@apollo/client/react';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/auth/hooks/useAuth';
import { useHasAccessTokenPair } from '@/auth/hooks/useHasAccessTokenPair';
import { EXCHANGE_SUPABASE_SESSION_FOR_AUTH_TOKENS } from '@/auth/graphql/mutations/exchangeSupabaseSessionForAuthTokens';
import { clientConfigApiStatusState } from '@/client-config/states/clientConfigApiStatusState';
import { useRedirectToWorkspaceDomain } from '@/domain-manager/hooks/useRedirectToWorkspaceDomain';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useLoadCurrentUser } from '@/users/hooks/useLoadCurrentUser';
import { isDefined } from 'twenty-shared/utils';

// Silently bridges a Supabase auth-token cookie (set on .w144.com) into a
// Twenty native tokenPair. Runs once at app load when no tokenPair exists.
// The backend returns workspaceUrls unconditionally, plus tokens iff the
// origin host matches the user's workspace. When origin doesn't match
// (typical for users landing on a multi-tenant entry host), tokens come back
// null and we redirect to the correct subdomain — the Supabase cookie on
// .w144.com follows, and the effect re-runs there to issue tokens.
// On any failure, does nothing — the user falls through to the sign-in screen.
export const SupabaseSsoBootstrapEffect = () => {
  const hasAccessTokenPair = useHasAccessTokenPair();
  const { isSaved: clientConfigLoaded } = useAtomStateValue(
    clientConfigApiStatusState,
  );

  const { setAuthTokens } = useAuth();
  const { loadCurrentUser } = useLoadCurrentUser();
  const { redirectToWorkspaceDomain } = useRedirectToWorkspaceDomain();

  const [exchangeSupabaseSession] = useMutation(
    EXCHANGE_SUPABASE_SESSION_FOR_AUTH_TOKENS,
  );

  const hasAttemptedExchangeRef = useRef(false);

  useEffect(() => {
    if (!clientConfigLoaded) return;
    if (hasAccessTokenPair) return;
    if (hasAttemptedExchangeRef.current) return;

    hasAttemptedExchangeRef.current = true;

    void (async () => {
      try {
        const result = await exchangeSupabaseSession({
          variables: { origin: window.location.origin },
        });

        const exchangeData = (
          result.data as
            | {
                exchangeSupabaseSessionForAuthTokens?: {
                  tokens?: unknown;
                  workspaceUrls?: {
                    customUrl?: string | null;
                    subdomainUrl?: string;
                  };
                };
              }
            | null
            | undefined
        )?.exchangeSupabaseSessionForAuthTokens;

        if (!isDefined(exchangeData)) return;

        const { tokens, workspaceUrls } = exchangeData;

        const targetSubdomainUrl = workspaceUrls?.subdomainUrl;
        const targetCustomUrl = workspaceUrls?.customUrl;
        const currentHost = window.location.host;

        const parseHostSafe = (url: string | null | undefined): string | null => {
          if (!isDefined(url)) return null;
          try {
            return new URL(url).host;
          } catch {
            return null;
          }
        };

        const targetSubdomainHost = parseHostSafe(targetSubdomainUrl);
        const targetCustomHost = parseHostSafe(targetCustomUrl);

        const needsRedirect =
          isDefined(targetSubdomainHost) &&
          targetSubdomainHost !== currentHost &&
          (targetCustomHost === null || targetCustomHost !== currentHost);

        if (!isDefined(tokens)) {
          if (needsRedirect && isDefined(targetSubdomainUrl)) {
            redirectToWorkspaceDomain(targetSubdomainUrl);
          }
          return;
        }

        if (needsRedirect && isDefined(targetSubdomainUrl)) {
          setAuthTokens(tokens as Parameters<typeof setAuthTokens>[0]);
          redirectToWorkspaceDomain(targetSubdomainUrl);
          return;
        }

        setAuthTokens(tokens as Parameters<typeof setAuthTokens>[0]);
        await loadCurrentUser();
      } catch {
        // No Supabase cookie / invalid cookie / unknown — stay anonymous.
      }
    })();
  }, [
    clientConfigLoaded,
    hasAccessTokenPair,
    exchangeSupabaseSession,
    setAuthTokens,
    loadCurrentUser,
    redirectToWorkspaceDomain,
  ]);

  return <></>;
};
