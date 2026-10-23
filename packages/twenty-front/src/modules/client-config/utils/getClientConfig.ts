import { type ClientConfig } from '@/client-config/types/ClientConfig';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

export const getClientConfig = async (): Promise<ClientConfig> => {
  // Multi-tenant: client config is workspace-aware; resolve via runtime
  // origin so the response matches the current subdomain.
  // Deploy rule for W144: the front and the server answer on the same origin
  // (app.crm.w144.com and each workspace subdomain go to twenty-server, which
  // serves both). A front on its own origin gets no /client-config and stops.
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
