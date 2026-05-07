import { useApolloFactory } from '@/apollo/hooks/useApolloFactory';
import { ApolloAdminClientContext } from '@/settings/admin-panel/apollo/contexts/ApolloAdminClientContext';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

export const ApolloAdminProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  // Multi-tenant: prefer runtime origin so admin-panel requests stay on the
  // current subdomain (matches /metadata and /graphql clients).
  const adminPanelUri =
    typeof window !== 'undefined' && window.location.origin
      ? `${window.location.origin}/admin-panel`
      : `${REACT_APP_SERVER_BASE_URL}/admin-panel`;

  const apolloAdminClient = useApolloFactory({
    uri: adminPanelUri,
  });

  return (
    <ApolloAdminClientContext.Provider value={apolloAdminClient}>
      {children}
    </ApolloAdminClientContext.Provider>
  );
};
