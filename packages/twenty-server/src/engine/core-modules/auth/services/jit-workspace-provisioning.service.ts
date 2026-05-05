import { Injectable, Logger } from '@nestjs/common';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

export type JitProvisionInput = {
  companyId: string;
  userEmail: string;
};

// Stub: provisions a fresh Twenty workspace inline when SupabaseJwtAuthStrategy
// encounters a hub_connections row with platform='twenty-hosted' and workspace_id=NULL.
@Injectable()
export class JitWorkspaceProvisioningService {
  private readonly logger = new Logger(JitWorkspaceProvisioningService.name);

  async provision(input: JitProvisionInput): Promise<WorkspaceEntity> {
    this.logger.warn(
      `provision() called for company=${input.companyId}, user=${input.userEmail} — not implemented`,
    );
    throw new Error(
      'JIT workspace provisioning is not yet implemented. A hub_connections row exists with platform=twenty-hosted and workspace_id=NULL but the actual provisioning logic has not landed yet.',
    );
  }
}
