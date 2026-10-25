import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { type ApiKeyEntity } from 'src/engine/core-modules/api-key/api-key.entity';
import { BTI_API_KEY_NAME } from 'src/engine/core-modules/auth/services/bti-api-key-provisioning.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthApiKey } from 'src/engine/decorators/auth/auth-api-key.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';

export type W144MemberRemoval = {
  removed: boolean;
  reason?: 'not_a_member' | 'only_member' | 'only_admin';
};

// POST /w144/members/remove { email }: a person left their company in W144
// (POST /api/w144/me/leave in the engine), so they leave the company's hosted
// CRM workspace too. Only the engine calls it, with the workspace's own
// "BTI Engine Sync" key (hub_connections.api_key, minted by the CRM itself),
// so it acts on that workspace and no other.
//
// The removal is the one Twenty does in Settings, Members, Remove (and when a
// person deletes their account): the workspace member and its access go, and
// the records they owned or were assigned stay, with that field cleared by
// Twenty's own rule. Twenty would delete the whole workspace with its last
// member; here the workspace and its data always stay, so the only member is
// left in place, and so is the only Admin (Twenty refuses that removal).
@Controller('w144')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard)
export class W144MembersController {
  private readonly logger = new Logger(W144MembersController.name);

  constructor(
    private readonly userService: UserService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
  ) {}

  @Post('members/remove')
  @HttpCode(200)
  async remove(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthApiKey() apiKey: ApiKeyEntity | undefined,
    @Body() body: { email?: string },
  ): Promise<W144MemberRemoval> {
    if (!isDefined(apiKey) || apiKey.name !== BTI_API_KEY_NAME) {
      throw new ForbiddenException(
        `Only the engine's "${BTI_API_KEY_NAME}" key may remove members here`,
      );
    }

    const email = body?.email?.trim().toLowerCase();

    if (!email) {
      throw new BadRequestException('email is required');
    }

    const user = await this.userRepository.findOne({ where: { email } });
    const userWorkspace = isDefined(user)
      ? await this.userWorkspaceRepository.findOne({
          where: { userId: user.id, workspaceId: workspace.id },
        })
      : null;

    if (!isDefined(user) || !isDefined(userWorkspace)) {
      return { removed: false, reason: 'not_a_member' };
    }

    const members = await this.userWorkspaceRepository.count({
      where: { workspaceId: workspace.id },
    });

    if (members <= 1) {
      return { removed: false, reason: 'only_member' };
    }

    try {
      await this.userService.deleteUserWorkspaceAndPotentiallyDeleteUser({
        userId: user.id,
        workspaceId: workspace.id,
      });
    } catch (error) {
      if (
        error instanceof PermissionsException &&
        error.code === PermissionsExceptionCode.CANNOT_DELETE_LAST_ADMIN_USER
      ) {
        return { removed: false, reason: 'only_admin' };
      }
      throw error;
    }

    this.logger.log(
      `W144 leave: removed user=${user.id} from workspace=${workspace.id}`,
    );

    return { removed: true };
  }
}
