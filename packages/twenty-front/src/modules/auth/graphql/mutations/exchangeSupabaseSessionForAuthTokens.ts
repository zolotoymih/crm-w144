import { gql } from '@apollo/client';

// Selections are inlined (not via ...AuthTokenPairFragment) so the document
// is self-contained at runtime even before codegen regenerates the typed
// document for `~/generated-metadata/graphql`.
export const EXCHANGE_SUPABASE_SESSION_FOR_AUTH_TOKENS = gql`
  mutation exchangeSupabaseSessionForAuthTokens($origin: String!) {
    exchangeSupabaseSessionForAuthTokens(origin: $origin) {
      tokens {
        accessOrWorkspaceAgnosticToken {
          token
          expiresAt
        }
        refreshToken {
          token
          expiresAt
        }
      }
      workspaceUrls {
        customUrl
        subdomainUrl
      }
    }
  }
`;
