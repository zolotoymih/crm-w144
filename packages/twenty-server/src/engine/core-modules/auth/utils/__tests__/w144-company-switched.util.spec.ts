import { type Request } from 'express';

import {
  type JwtPayload,
  JwtTokenTypeEnum,
} from 'src/engine/core-modules/auth/types/auth-context.type';
import {
  W144CompanySwitchedException,
  workspaceOfAccessToken,
} from 'src/engine/core-modules/auth/utils/w144-company-switched.util';

// The workspace a page was drawn for, read from the Twenty access token it
// still sends; the CRM compares it with the workspace of the company the
// person works in now (owner decision 159, question 13).
describe('workspaceOfAccessToken', () => {
  const request = {} as Request;
  const decodeTo = (payload: JwtPayload | null) => () => payload;

  it('names the workspace of an access token', () => {
    expect(
      workspaceOfAccessToken(
        request,
        () => 'token',
        decodeTo({
          type: JwtTokenTypeEnum.ACCESS,
          workspaceId: 'workspace-a',
        } as JwtPayload),
      ),
    ).toBe('workspace-a');
  });

  it('names nothing without a token, for a workspace agnostic token or an API key', () => {
    expect(workspaceOfAccessToken(request, () => null, decodeTo(null))).toBe(
      null,
    );
    expect(
      workspaceOfAccessToken(
        request,
        () => 'token',
        decodeTo({
          type: JwtTokenTypeEnum.WORKSPACE_AGNOSTIC,
        } as JwtPayload),
      ),
    ).toBe(null);
    expect(
      workspaceOfAccessToken(
        request,
        () => 'token',
        decodeTo({
          type: JwtTokenTypeEnum.API_KEY,
          workspaceId: 'workspace-a',
        } as JwtPayload),
      ),
    ).toBe(null);
  });

  it('names nothing for a token that does not decode', () => {
    expect(
      workspaceOfAccessToken(
        request,
        () => 'not a token',
        () => {
          throw new Error('jwt malformed');
        },
      ),
    ).toBe(null);
  });

  it('is refused with 409 COMPANY_SWITCHED', () => {
    const refusal = new W144CompanySwitchedException();

    expect(refusal.status).toBe(409);
    expect(refusal.code).toBe('COMPANY_SWITCHED');
  });
});
