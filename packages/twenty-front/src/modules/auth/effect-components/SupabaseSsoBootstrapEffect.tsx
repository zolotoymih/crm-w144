import { useMutation } from '@apollo/client/react';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/auth/hooks/useAuth';
import { useHasAccessTokenPair } from '@/auth/hooks/useHasAccessTokenPair';
import { EXCHANGE_SUPABASE_SESSION_FOR_AUTH_TOKENS } from '@/auth/graphql/mutations/exchangeSupabaseSessionForAuthTokens';
import { clientConfigApiStatusState } from '@/client-config/states/clientConfigApiStatusState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useLoadCurrentUser } from '@/users/hooks/useLoadCurrentUser';
import { isDefined } from 'twenty-shared/utils';

// Silently bridges a Supabase auth-token cookie (set on .w144.com) into a
// Twenty native tokenPair. Runs once at app load when no tokenPair exists.
// On 401 / any failure, does nothing — the user falls through to the regular
// sign-in screen via usePageChangeEffectNavigateLocation.
export const SupabaseSsoBootstrapEffect = () => {
  const hasAccessTokenPair = useHasAccessTokenPair();
  const { isSaved: clientConfigLoaded } = useAtomStateValue(
    clientConfigApiStatusState,
  );

  const { setAuthTokens } = useAuth();
  const { loadCurrentUser } = useLoadCurrentUser();

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

        const tokens = (
          result.data as
            | {
                exchangeSupabaseSessionForAuthTokens?: {
                  tokens?: unknown;
                };
              }
            | null
            | undefined
        )?.exchangeSupabaseSessionForAuthTokens?.tokens;

        if (!isDefined(tokens)) return;

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
  ]);

  return <></>;
};
