import { getRestApiBaseUrl } from '@/apollo/constant/rest-api-base-url';

export const getSdkClientUrls = (applicationId: string) => {
  const baseUrl = getRestApiBaseUrl();
  return {
    core: `${baseUrl}/sdk-client/${applicationId}/core`,
    metadata: `${baseUrl}/sdk-client/${applicationId}/metadata`,
  };
};
