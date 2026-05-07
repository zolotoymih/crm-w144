import { ApolloProvider as ApolloProviderBase } from '@apollo/client/react';

import { useApolloFactory } from '@/apollo/hooks/useApolloFactory';
import { createCaptchaRefreshLink } from '@/apollo/utils/captchaRefreshLink';
import { useRequestFreshCaptchaToken } from '@/captcha/hooks/useRequestFreshCaptchaToken';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

export const ApolloProvider = ({ children }: React.PropsWithChildren) => {
  const { requestFreshCaptchaToken } = useRequestFreshCaptchaToken();

  const captchaRefreshLink = createCaptchaRefreshLink(requestFreshCaptchaToken);

  // Multi-tenant: each workspace lives on its own subdomain and the backend
  // resolves the workspace from the request origin. Prefer the runtime origin
  // over the build-time base URL so requests stay on the current subdomain.
  const metadataUri =
    typeof window !== 'undefined' && window.location.origin
      ? `${window.location.origin}/metadata`
      : `${REACT_APP_SERVER_BASE_URL}/metadata`;

  const apolloClient = useApolloFactory({
    uri: metadataUri,
    devtools: { enabled: process.env.IS_DEBUG_MODE === 'true' },
    extraLinks: [captchaRefreshLink],
  });

  // Expose Apollo client in development to Apollo Dev Tools
  if (process.env.NODE_ENV === 'development') {
    window.__APOLLO_CLIENT__ = apolloClient;
  }

  return (
    <ApolloProviderBase client={apolloClient}>{children}</ApolloProviderBase>
  );
};
