import { REACT_APP_SERVER_BASE_URL } from '~/config';

// Multi-tenant: workspaces live on per-subdomain origins; resolving the REST
// base URL at call time (not module-load) keeps requests on the workspace
// subdomain even if the build-time base URL is pinned to an apex domain.
export const getRestApiBaseUrl = (): string =>
  typeof window !== 'undefined' && window.location.origin
    ? `${window.location.origin}/rest`
    : `${REACT_APP_SERVER_BASE_URL}/rest`;
