import { Field, ObjectType } from '@nestjs/graphql';

import { AuthTokenPair } from 'src/engine/core-modules/auth/dto/auth-token-pair.dto';
import { WorkspaceUrlsDTO } from 'src/engine/core-modules/workspace/dtos/workspace-urls.dto';

@ObjectType()
export class SupabaseSessionExchangeOutput {
  @Field(() => AuthTokenPair, { nullable: true })
  tokens: AuthTokenPair | null;

  @Field(() => WorkspaceUrlsDTO)
  workspaceUrls: WorkspaceUrlsDTO;
}
