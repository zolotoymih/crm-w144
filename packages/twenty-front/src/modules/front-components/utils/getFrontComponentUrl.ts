import { getRestApiBaseUrl } from '@/apollo/constant/rest-api-base-url';
import { isDefined } from 'twenty-shared/utils';

export const getFrontComponentUrl = ({
  frontComponentId,
  checksum,
}: {
  frontComponentId: string;
  checksum?: string;
}): string => {
  const baseUrl = getRestApiBaseUrl();
  return isDefined(checksum)
    ? `${baseUrl}/front-components/${frontComponentId}?checksum=${checksum}`
    : `${baseUrl}/front-components/${frontComponentId}`;
};
