import { UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import {
  toW144CrmRoleKind,
  W144_VIEWER_ROLE_LABEL,
  W144_VIEWER_ROLE_UNIVERSAL_IDENTIFIER,
  W144CrmRoleService,
} from 'src/engine/core-modules/auth/services/w144-crm-role.service';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

const WORKSPACE_ID = 'workspace-id';
const USER_WORKSPACE_ID = 'user-workspace-id';
const ADMIN_ROLE_ID = 'admin-role-id';
const MEMBER_ROLE_ID = 'member-role-id';
const VIEWER_ROLE_ID = 'viewer-role-id';

const workspace = { id: WORKSPACE_ID, defaultRoleId: MEMBER_ROLE_ID };

describe('toW144CrmRoleKind', () => {
  it('maps owner and admin to admin', () => {
    expect(toW144CrmRoleKind('owner')).toBe('admin');
    expect(toW144CrmRoleKind('admin')).toBe('admin');
  });

  it('maps member to member', () => {
    expect(toW144CrmRoleKind('member')).toBe('member');
  });

  it('maps viewer and anything unknown to viewer', () => {
    expect(toW144CrmRoleKind('viewer')).toBe('viewer');
    expect(toW144CrmRoleKind(null)).toBe('viewer');
    expect(toW144CrmRoleKind(undefined)).toBe('viewer');
    expect(toW144CrmRoleKind('Owner')).toBe('viewer');
    expect(toW144CrmRoleKind('superadmin')).toBe('viewer');
  });
});

describe('W144CrmRoleService', () => {
  let service: W144CrmRoleService;
  let roleService: {
    getRoleByUniversalIdentifier: jest.Mock;
    createRole: jest.Mock;
  };
  let roleRepository: { findOne: jest.Mock };
  let userRoleService: {
    assignRoleToManyUserWorkspace: jest.Mock;
    getRolesByUserWorkspaces: jest.Mock;
  };
  let workspaceCacheService: { getOrRecompute: jest.Mock };

  beforeEach(async () => {
    roleService = {
      getRoleByUniversalIdentifier: jest.fn(),
      createRole: jest.fn(),
    };
    roleRepository = { findOne: jest.fn() };
    userRoleService = {
      assignRoleToManyUserWorkspace: jest.fn(),
      getRolesByUserWorkspaces: jest.fn(),
    };
    workspaceCacheService = { getOrRecompute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        W144CrmRoleService,
        { provide: getRepositoryToken(RoleEntity), useValue: roleRepository },
        { provide: RoleService, useValue: roleService },
        { provide: UserRoleService, useValue: userRoleService },
        {
          provide: ApplicationService,
          useValue: {
            findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
              .fn()
              .mockResolvedValue({
                workspaceCustomFlatApplication: { id: 'custom-app-id' },
              }),
          },
        },
        { provide: WorkspaceCacheService, useValue: workspaceCacheService },
      ],
    }).compile();

    service = module.get(W144CrmRoleService);
  });

  describe('resolveRoleId', () => {
    it('gives owner and admin the standard Admin role', async () => {
      roleService.getRoleByUniversalIdentifier.mockResolvedValue({
        id: ADMIN_ROLE_ID,
      });

      await expect(
        service.resolveRoleId({ workspace, w144CrmRoleKind: 'admin' }),
      ).resolves.toBe(ADMIN_ROLE_ID);
      expect(roleService.getRoleByUniversalIdentifier).toHaveBeenCalledWith({
        universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
        workspaceId: WORKSPACE_ID,
      });
    });

    it('gives member the workspace default role', async () => {
      await expect(
        service.resolveRoleId({ workspace, w144CrmRoleKind: 'member' }),
      ).resolves.toBe(MEMBER_ROLE_ID);
    });

    it('reuses the Viewer (W144) role when the workspace already has it', async () => {
      roleService.getRoleByUniversalIdentifier.mockResolvedValue({
        id: VIEWER_ROLE_ID,
      });

      await expect(
        service.resolveRoleId({ workspace, w144CrmRoleKind: 'viewer' }),
      ).resolves.toBe(VIEWER_ROLE_ID);
      expect(roleService.getRoleByUniversalIdentifier).toHaveBeenCalledWith({
        universalIdentifier: W144_VIEWER_ROLE_UNIVERSAL_IDENTIFIER,
        workspaceId: WORKSPACE_ID,
      });
      expect(roleService.createRole).not.toHaveBeenCalled();
    });

    it('creates a read-only Viewer (W144) role once when it is missing', async () => {
      roleService.getRoleByUniversalIdentifier.mockResolvedValue(null);
      roleService.createRole.mockResolvedValue({ id: VIEWER_ROLE_ID });

      await expect(
        service.resolveRoleId({ workspace, w144CrmRoleKind: 'viewer' }),
      ).resolves.toBe(VIEWER_ROLE_ID);

      expect(roleService.createRole).toHaveBeenCalledTimes(1);
      expect(roleService.createRole).toHaveBeenCalledWith({
        input: expect.objectContaining({
          universalIdentifier: W144_VIEWER_ROLE_UNIVERSAL_IDENTIFIER,
          label: W144_VIEWER_ROLE_LABEL,
          canReadAllObjectRecords: true,
          canUpdateAllObjectRecords: false,
          canSoftDeleteAllObjectRecords: false,
          canDestroyAllObjectRecords: false,
          canUpdateAllSettings: false,
          canAccessAllTools: false,
          canBeAssignedToUsers: true,
          canBeAssignedToAgents: false,
          canBeAssignedToApiKeys: false,
        }),
        workspaceId: WORKSPACE_ID,
        ownerFlatApplication: { id: 'custom-app-id' },
      });
    });

    it('uses the role a parallel sign-in created when its own create loses the race', async () => {
      roleService.getRoleByUniversalIdentifier.mockResolvedValue(null);
      roleService.createRole.mockRejectedValue(
        new Error('duplicate key value violates unique constraint'),
      );
      roleRepository.findOne.mockResolvedValue({ id: VIEWER_ROLE_ID });

      await expect(
        service.resolveRoleId({ workspace, w144CrmRoleKind: 'viewer' }),
      ).resolves.toBe(VIEWER_ROLE_ID);
      expect(roleRepository.findOne).toHaveBeenCalledWith({
        where: {
          workspaceId: WORKSPACE_ID,
          universalIdentifier: W144_VIEWER_ROLE_UNIVERSAL_IDENTIFIER,
        },
      });
    });

    it('refuses a viewer when the read-only role cannot be made', async () => {
      const createError = new Error('label already used');

      roleService.getRoleByUniversalIdentifier.mockResolvedValue(null);
      roleService.createRole.mockRejectedValue(createError);
      roleRepository.findOne.mockResolvedValue(null);

      await expect(
        service.resolveRoleId({ workspace, w144CrmRoleKind: 'viewer' }),
      ).rejects.toBe(createError);
    });
  });

  describe('applyRole', () => {
    const mockCurrentRole = (roleId: string | undefined) =>
      workspaceCacheService.getOrRecompute.mockResolvedValue({
        userWorkspaceRoleMap: roleId ? { [USER_WORKSPACE_ID]: roleId } : {},
      });

    it('does nothing when the role already matches', async () => {
      mockCurrentRole(VIEWER_ROLE_ID);

      await service.applyRole({
        workspaceId: WORKSPACE_ID,
        userWorkspaceId: USER_WORKSPACE_ID,
        roleId: VIEWER_ROLE_ID,
      });

      expect(
        userRoleService.assignRoleToManyUserWorkspace,
      ).not.toHaveBeenCalled();
    });

    it('moves a member demoted in W144 to the viewer role', async () => {
      mockCurrentRole(MEMBER_ROLE_ID);

      await service.applyRole({
        workspaceId: WORKSPACE_ID,
        userWorkspaceId: USER_WORKSPACE_ID,
        roleId: VIEWER_ROLE_ID,
      });

      expect(
        userRoleService.assignRoleToManyUserWorkspace,
      ).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        userWorkspaceIds: [USER_WORKSPACE_ID],
        roleId: VIEWER_ROLE_ID,
      });
    });

    it('refuses sign-in instead of keeping Admin for a demoted last admin', async () => {
      mockCurrentRole(ADMIN_ROLE_ID);
      userRoleService.assignRoleToManyUserWorkspace.mockRejectedValue(
        new PermissionsException(
          PermissionsExceptionMessage.CANNOT_UNASSIGN_LAST_ADMIN,
          PermissionsExceptionCode.CANNOT_UNASSIGN_LAST_ADMIN,
        ),
      );

      await expect(
        service.applyRole({
          workspaceId: WORKSPACE_ID,
          userWorkspaceId: USER_WORKSPACE_ID,
          roleId: VIEWER_ROLE_ID,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(userRoleService.getRolesByUserWorkspaces).not.toHaveBeenCalled();
    });

    it('accepts losing a race to a parallel request that set the same role', async () => {
      mockCurrentRole(MEMBER_ROLE_ID);
      userRoleService.assignRoleToManyUserWorkspace.mockRejectedValue(
        new Error('duplicate key value violates unique constraint'),
      );
      userRoleService.getRolesByUserWorkspaces.mockResolvedValue(
        new Map([[USER_WORKSPACE_ID, [{ id: VIEWER_ROLE_ID }]]]),
      );

      await expect(
        service.applyRole({
          workspaceId: WORKSPACE_ID,
          userWorkspaceId: USER_WORKSPACE_ID,
          roleId: VIEWER_ROLE_ID,
        }),
      ).resolves.toBeUndefined();
    });

    it('rethrows when the role still does not match after a failure', async () => {
      const assignError = new Error('database is down');

      mockCurrentRole(MEMBER_ROLE_ID);
      userRoleService.assignRoleToManyUserWorkspace.mockRejectedValue(
        assignError,
      );
      userRoleService.getRolesByUserWorkspaces.mockResolvedValue(
        new Map([[USER_WORKSPACE_ID, [{ id: MEMBER_ROLE_ID }]]]),
      );

      await expect(
        service.applyRole({
          workspaceId: WORKSPACE_ID,
          userWorkspaceId: USER_WORKSPACE_ID,
          roleId: VIEWER_ROLE_ID,
        }),
      ).rejects.toBe(assignError);
    });
  });
});
