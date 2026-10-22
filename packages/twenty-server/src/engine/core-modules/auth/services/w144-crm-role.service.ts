import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

// The same universal identifier in every workspace, so the role is found again
// even after an admin renames it in Settings.
export const W144_VIEWER_ROLE_UNIVERSAL_IDENTIFIER =
  '245150f8-fa27-4454-aae1-df1e50d77b48';

export const W144_VIEWER_ROLE_LABEL = 'Viewer (W144)';

export type W144CrmRoleKind = 'admin' | 'member' | 'viewer';

// W144 roles (profiles.role) are owner, admin, member and viewer. Anything
// else, including a missing value, is treated as viewer so that a bad value
// never grants write access.
export const toW144CrmRoleKind = (w144Role: unknown): W144CrmRoleKind => {
  switch (w144Role) {
    case 'owner':
    case 'admin':
      return 'admin';
    case 'member':
      return 'member';
    default:
      return 'viewer';
  }
};

// Keeps a person's CRM role in line with their W144 role. It runs at every
// W144 sign-in, so a role changed in W144 (Settings, Team) applies the next
// time the person opens the CRM.
@Injectable()
export class W144CrmRoleService {
  private readonly logger = new Logger(W144CrmRoleService.name);

  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepository: Repository<RoleEntity>,
    private readonly roleService: RoleService,
    private readonly userRoleService: UserRoleService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {}

  async resolveRoleId({
    workspace,
    w144CrmRoleKind,
  }: {
    workspace: Pick<WorkspaceEntity, 'id' | 'defaultRoleId'>;
    w144CrmRoleKind: W144CrmRoleKind;
  }): Promise<string> {
    switch (w144CrmRoleKind) {
      case 'admin': {
        const adminRole = await this.roleService.getRoleByUniversalIdentifier({
          universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
          workspaceId: workspace.id,
        });

        if (!isDefined(adminRole)) {
          throw new UnauthorizedException(
            'The CRM workspace has no Admin role',
          );
        }

        return adminRole.id;
      }
      case 'member': {
        if (!isDefined(workspace.defaultRoleId)) {
          throw new UnauthorizedException(
            'The CRM workspace has no default Member role',
          );
        }

        return workspace.defaultRoleId;
      }
      case 'viewer':
        return this.findOrCreateViewerRoleId(workspace.id);
    }
  }

  async applyRole({
    workspaceId,
    userWorkspaceId,
    roleId,
  }: {
    workspaceId: string;
    userWorkspaceId: string;
    roleId: string;
  }): Promise<void> {
    const { userWorkspaceRoleMap } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'userWorkspaceRoleMap',
      ]);

    if (userWorkspaceRoleMap[userWorkspaceId] === roleId) {
      return;
    }

    try {
      // Twenty's own assignment: it replaces the current role and refuses to
      // take the Admin role away from the workspace's last admin.
      await this.userRoleService.assignRoleToManyUserWorkspace({
        workspaceId,
        userWorkspaceIds: [userWorkspaceId],
        roleId,
      });

      this.logger.log(
        `CRM role changed to match W144: userWorkspace=${userWorkspaceId}, role=${roleId}`,
      );
    } catch (error) {
      if (
        error instanceof PermissionsException &&
        error.code === PermissionsExceptionCode.CANNOT_UNASSIGN_LAST_ADMIN
      ) {
        // Letting the person in would keep Admin rights that W144 no longer
        // gives them, so they wait until an owner or admin has opened the CRM.
        throw new UnauthorizedException(
          'You are the only admin of this CRM, but your W144 role is lower now. Ask a W144 owner or admin to open the CRM first.',
        );
      }

      // Parallel requests from one page can race to switch the same role.
      // One wins and the others hit the unique index; that is fine as long
      // as the role now stored is the one we wanted.
      const rolesByUserWorkspace =
        await this.userRoleService.getRolesByUserWorkspaces({
          userWorkspaceIds: [userWorkspaceId],
          workspaceId,
        });

      if (rolesByUserWorkspace.get(userWorkspaceId)?.[0]?.id === roleId) {
        return;
      }

      throw error;
    }
  }

  private async findOrCreateViewerRoleId(workspaceId: string): Promise<string> {
    const existingRole = await this.roleService.getRoleByUniversalIdentifier({
      universalIdentifier: W144_VIEWER_ROLE_UNIVERSAL_IDENTIFIER,
      workspaceId,
    });

    if (isDefined(existingRole)) {
      return existingRole.id;
    }

    const { workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );

    try {
      const createdRole = await this.roleService.createRole({
        input: {
          universalIdentifier: W144_VIEWER_ROLE_UNIVERSAL_IDENTIFIER,
          label: W144_VIEWER_ROLE_LABEL,
          description:
            'Read-only access for people with the Viewer role in W144',
          icon: 'IconEye',
          canUpdateAllSettings: false,
          canAccessAllTools: false,
          canReadAllObjectRecords: true,
          canUpdateAllObjectRecords: false,
          canSoftDeleteAllObjectRecords: false,
          canDestroyAllObjectRecords: false,
          canBeAssignedToUsers: true,
          canBeAssignedToAgents: false,
          canBeAssignedToApiKeys: false,
        },
        workspaceId,
        ownerFlatApplication: workspaceCustomFlatApplication,
      });

      this.logger.log(
        `Created the ${W144_VIEWER_ROLE_LABEL} role in workspace=${workspaceId}`,
      );

      return createdRole.id;
    } catch (error) {
      // Two first viewer sign-ins at the same time both try to create the
      // role and the unique indexes let only one through. The other reads
      // the winner's row from the database, since the cache may lag behind.
      const roleCreatedMeanwhile = await this.roleRepository.findOne({
        where: {
          workspaceId,
          universalIdentifier: W144_VIEWER_ROLE_UNIVERSAL_IDENTIFIER,
        },
      });

      if (isDefined(roleCreatedMeanwhile)) {
        return roleCreatedMeanwhile.id;
      }

      throw error;
    }
  }
}
