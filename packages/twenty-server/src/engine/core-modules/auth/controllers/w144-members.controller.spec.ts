import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { W144MembersController } from 'src/engine/core-modules/auth/controllers/w144-members.controller';
import { BTI_API_KEY_NAME } from 'src/engine/core-modules/auth/services/bti-api-key-provisioning.service';
import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/metadata-modules/permissions/permissions.exception';

const workspace = { id: 'workspace-id' } as never;
const engineKey = { id: 'key-id', name: BTI_API_KEY_NAME } as never;

describe('W144MembersController', () => {
  let userService: { deleteUserWorkspaceAndPotentiallyDeleteUser: jest.Mock };
  let userRepository: { findOne: jest.Mock };
  let userWorkspaceRepository: { findOne: jest.Mock; count: jest.Mock };
  let controller: W144MembersController;

  beforeEach(() => {
    userService = {
      deleteUserWorkspaceAndPotentiallyDeleteUser: jest
        .fn()
        .mockResolvedValue({}),
    };
    userRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'user-id' }),
    };
    userWorkspaceRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'user-workspace-id' }),
      count: jest.fn().mockResolvedValue(3),
    };
    controller = new W144MembersController(
      userService as never,
      userRepository as never,
      userWorkspaceRepository as never,
    );
  });

  it('refuses a call without the engine key', async () => {
    await expect(
      controller.remove(workspace, undefined, { email: 'lane@w144test.test' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.remove(workspace, { id: 'k', name: 'Zapier' } as never, {
        email: 'lane@w144test.test',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      userService.deleteUserWorkspaceAndPotentiallyDeleteUser,
    ).not.toHaveBeenCalled();
  });

  it('asks for an email', async () => {
    await expect(
      controller.remove(workspace, engineKey, { email: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes the member from this workspace only', async () => {
    await expect(
      controller.remove(workspace, engineKey, { email: ' Lane@W144test.test ' }),
    ).resolves.toEqual({ removed: true });
    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { email: 'lane@w144test.test' },
    });
    expect(userWorkspaceRepository.findOne).toHaveBeenCalledWith({
      where: { userId: 'user-id', workspaceId: 'workspace-id' },
    });
    expect(
      userService.deleteUserWorkspaceAndPotentiallyDeleteUser,
    ).toHaveBeenCalledWith({ userId: 'user-id', workspaceId: 'workspace-id' });
  });

  it('says so when the person is not a member', async () => {
    userWorkspaceRepository.findOne.mockResolvedValue(null);
    await expect(
      controller.remove(workspace, engineKey, { email: 'x@w144test.test' }),
    ).resolves.toEqual({ removed: false, reason: 'not_a_member' });
    userRepository.findOne.mockResolvedValue(null);
    await expect(
      controller.remove(workspace, engineKey, { email: 'x@w144test.test' }),
    ).resolves.toEqual({ removed: false, reason: 'not_a_member' });
    expect(
      userService.deleteUserWorkspaceAndPotentiallyDeleteUser,
    ).not.toHaveBeenCalled();
  });

  it('never removes the last member, which would delete the workspace', async () => {
    userWorkspaceRepository.count.mockResolvedValue(1);
    await expect(
      controller.remove(workspace, engineKey, { email: 'lane@w144test.test' }),
    ).resolves.toEqual({ removed: false, reason: 'only_member' });
    expect(
      userService.deleteUserWorkspaceAndPotentiallyDeleteUser,
    ).not.toHaveBeenCalled();
  });

  it('leaves the only Admin in place', async () => {
    userService.deleteUserWorkspaceAndPotentiallyDeleteUser.mockRejectedValue(
      new PermissionsException(
        PermissionsExceptionMessage.CANNOT_DELETE_LAST_ADMIN_USER,
        PermissionsExceptionCode.CANNOT_DELETE_LAST_ADMIN_USER,
      ),
    );
    await expect(
      controller.remove(workspace, engineKey, { email: 'lane@w144test.test' }),
    ).resolves.toEqual({ removed: false, reason: 'only_admin' });
  });
});
