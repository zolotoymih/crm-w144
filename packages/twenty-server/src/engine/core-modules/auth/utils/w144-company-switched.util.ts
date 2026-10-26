import { type Request } from 'express';

import {
  type JwtPayload,
  JwtTokenTypeEnum,
} from 'src/engine/core-modules/auth/types/auth-context.type';

// One person can be in several W144 companies (the engine's migration 035,
// owner decision 159) and works in one of them at a time: the W144 profile's
// company. A request signed in with W144 opens that company's workspace,
// whatever the page asking for it shows. A page drawn for a workspace before
// a switch made in another window still sends the access token Twenty gave
// it for that workspace; such a request is refused, so a stale window never
// reads or writes the other company's CRM.
export class W144CompanySwitchedException extends Error {
  readonly status = 409;
  readonly code = 'COMPANY_SWITCHED';

  constructor() {
    super(
      'This window shows another company than the one you work in now: you switched in another window. Reload the page.',
    );
    this.name = 'W144CompanySwitchedException';
  }
}

/**
 * The workspace a request's Twenty access token was issued for, or null when
 * it carries no such token (none yet, an API key, a workspace agnostic one).
 */
export const workspaceOfAccessToken = (
  request: Request,
  extract: (request: Request) => string | null,
  decode: (token: string) => JwtPayload | null,
): string | null => {
  const token = extract(request);

  if (!token) return null;

  let payload: JwtPayload | null = null;

  try {
    payload = decode(token);
  } catch {
    return null;
  }

  return payload?.type === JwtTokenTypeEnum.ACCESS ? payload.workspaceId : null;
};
