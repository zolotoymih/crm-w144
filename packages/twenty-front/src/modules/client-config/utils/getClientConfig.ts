import { type ClientConfig } from '@/client-config/types/ClientConfig';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

export const getClientConfig = async (): Promise<ClientConfig> => {
  // Multi-tenant: client config is workspace-aware; resolve via runtime
  // origin so the response matches the current subdomain.
  const clientConfigUrl =
    typeof window !== 'undefined' && window.location.origin
      ? `${window.location.origin}/client-config`
      : `${REACT_APP_SERVER_BASE_URL}/client-config`;

  const response = await fetch(clientConfigUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch client config: ${response.status} ${response.statusText}`,
    );
  }

  const clientConfig: ClientConfig = await response.json();

  return clientConfig;
};
