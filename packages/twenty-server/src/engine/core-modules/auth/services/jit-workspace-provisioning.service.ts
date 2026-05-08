import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { SignInUpService } from 'src/engine/core-modules/auth/services/sign-in-up.service';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { ExistingUserOrPartialUserWithPicture } from 'src/engine/core-modules/auth/types/signInUp.type';
import {
  SUPABASE_AUTH_CLIENT,
  type SupabaseAuthClient,
} from 'src/engine/core-modules/auth/services/supabase-auth-client.provider';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceService } from 'src/engine/core-modules/workspace/services/workspace.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

export type JitProvisionInput = {
  companyId: string;
  userData: ExistingUserOrPartialUserWithPicture['userData'];
};

export type JitProvisionResult = {
  user: UserEntity;
  workspace: WorkspaceEntity;
};

// JIT-provisions a fresh Twenty workspace when SupabaseJwtAuthStrategy encounters
// a hub_connections row with platform='twenty-hosted' and workspace_id=NULL.
@Injectable()
export class JitWorkspaceProvisioningService {
  private readonly logger = new Logger(JitWorkspaceProvisioningService.name);

  constructor(
    private readonly signInUpService: SignInUpService,
    private readonly workspaceService: WorkspaceService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    @Inject(SUPABASE_AUTH_CLIENT)
    private readonly supabaseAuthClient: SupabaseAuthClient,
  ) {}

  async provision(input: JitProvisionInput): Promise<JitProvisionResult> {
    const displayName = await this.lookupDisplayName(input.companyId);

    let provisionedWorkspaceId: string | undefined;

    try {
      // 1. Create PENDING workspace + user (if new) + UserWorkspace.
      const { user, workspace } =
        await this.signInUpService.signUpOnNewWorkspace(input.userData);

      provisionedWorkspaceId = workspace.id;
      this.logger.log(
        `signUpOnNewWorkspace OK: workspace=${workspace.id}, user=${user.id}, company=${input.companyId}`,
      );

      // 2. Activate: per-workspace schema, default roles, prefill, ACTIVE status.
      // UserEntity has Date fields where AuthContextUser has them as strings — only
      // structural mismatch, runtime values are fine; cast follows codebase convention.
      await this.workspaceService.activateWorkspace(
        user as unknown as AuthContextUser,
        workspace,
        { displayName },
      );
      this.logger.log(
        `activateWorkspace OK: workspace=${workspace.id}, displayName="${displayName}"`,
      );

      // 3. Race-safe write-back to hub_connections.
      // If workspace_id is already set by a concurrent provisioning, our UPDATE
      // matches 0 rows — we lose the race and clean up our orphan workspace.
      const winnerWorkspace = await this.writeBackHubConnection({
        companyId: input.companyId,
        newWorkspaceId: workspace.id,
        ourWorkspace: workspace,
      });

      return { user, workspace: winnerWorkspace };
    } catch (error) {
      // Compensation: best-effort cleanup of orphan workspace.
      if (provisionedWorkspaceId) {
        this.logger.error(
          `Provisioning failed (workspace=${provisionedWorkspaceId}): ${error instanceof Error ? error.message : String(error)}`,
        );
        await this.workspaceService
          .deleteWorkspace(provisionedWorkspaceId)
          .catch((cleanupError) => {
            this.logger.error(
              `Cleanup of orphan workspace=${provisionedWorkspaceId} also failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
            );
          });
      }
      throw error;
    }
  }

  private async lookupDisplayName(companyId: string): Promise<string> {
    const { data: company, error } = await this.supabaseAuthClient.client
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .maybeSingle();

    if (error) {
      this.logger.warn(
        `Failed to lookup company.name for company=${companyId}: ${error.message}`,
      );
    }

    const trimmed = company?.name?.trim();

    if (trimmed) {
      return trimmed;
    }

    this.logger.warn(
      `No company.name found for company=${companyId}, using fallback displayName`,
    );

    return 'Workspace';
  }

  private async writeBackHubConnection(args: {
    companyId: string;
    newWorkspaceId: string;
    ourWorkspace: WorkspaceEntity;
  }): Promise<WorkspaceEntity> {
    const { data: locked, error: lockError } =
      await this.supabaseAuthClient.client
        .from('hub_connections')
        .update({
          workspace_id: args.newWorkspaceId,
          subdomain: args.ourWorkspace.subdomain,
          status: 'connected',
        })
        .eq('company_id', args.companyId)
        .eq('hub_type', 'crm')
        .eq('platform', 'twenty-hosted')
        .is('workspace_id', null)
        .select('workspace_id')
        .maybeSingle();

    if (lockError) {
      throw new Error(
        `hub_connections write-back failed for company=${args.companyId}: ${lockError.message}`,
      );
    }

    if (locked) {
      this.logger.log(
        `hub_connections updated: company=${args.companyId}, workspace=${args.newWorkspaceId}`,
      );

      return args.ourWorkspace;
    }

    // Race lost — concurrent provisioning won. Re-read the winner.
    this.logger.warn(
      `Race lost for company=${args.companyId}, deleting our orphan workspace=${args.newWorkspaceId}`,
    );

    await this.workspaceService
      .deleteWorkspace(args.newWorkspaceId)
      .catch((cleanupError) => {
        this.logger.error(
          `Cleanup of orphan after race loss failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      });

    const { data: winner, error: winnerError } =
      await this.supabaseAuthClient.client
        .from('hub_connections')
        .select('workspace_id')
        .eq('company_id', args.companyId)
        .eq('hub_type', 'crm')
        .single();

    if (winnerError || !winner?.workspace_id) {
      throw new Error(
        `Race winner workspace_id not found in hub_connections for company=${args.companyId}: ${winnerError?.message ?? 'no row'}`,
      );
    }

    const winnerWorkspace = await this.workspaceRepository.findOne({
      where: { id: winner.workspace_id },
    });

    if (!winnerWorkspace) {
      throw new Error(
        `Race winner workspace=${winner.workspace_id} not found in core.workspace`,
      );
    }

    return winnerWorkspace;
  }
}
