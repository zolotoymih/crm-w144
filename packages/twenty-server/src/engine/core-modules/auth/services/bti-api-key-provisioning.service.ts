import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { addDays } from 'date-fns';
import { Repository } from 'typeorm';

import { ApiKeyService } from 'src/engine/core-modules/api-key/services/api-key.service';
import {
  SUPABASE_AUTH_CLIENT,
  type SupabaseAuthClient,
} from 'src/engine/core-modules/auth/services/supabase-auth-client.provider';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

export const BTI_API_KEY_NAME = 'BTI Engine Sync';

const NEVER_EXPIRE_DAYS = 100 * 365;

// Mints a workspace API key for the BTI engine and writes it into the shared
// Supabase hub_connections row (api_key), so the engine worker can poll this
// workspace's pipeline without any manual key handling ("BTI manages
// credentials internally"). Idempotent: reuses the active 'BTI Engine Sync'
// key entity and just re-issues its token.
@Injectable()
export class BtiApiKeyProvisioningService {
  private readonly logger = new Logger(BtiApiKeyProvisioningService.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepository: Repository<RoleEntity>,
    private readonly apiKeyService: ApiKeyService,
    @Inject(SUPABASE_AUTH_CLIENT)
    private readonly supabaseAuthClient: SupabaseAuthClient,
  ) {}

  async mintForCompany(companyId: string): Promise<{ workspaceId: string }> {
    const { data: conn, error: connError } =
      await this.supabaseAuthClient.client
        .from('hub_connections')
        .select('workspace_id, subdomain, base_url')
        .eq('company_id', companyId)
        .eq('hub_type', 'crm')
        .eq('platform', 'twenty-hosted')
        .maybeSingle();

    if (connError) {
      throw new Error(
        `hub_connections lookup failed for company=${companyId}: ${connError.message}`,
      );
    }
    if (!conn) {
      throw new Error(
        `No twenty-hosted CRM hub_connection for company=${companyId}`,
      );
    }

    const workspace = await this.resolveWorkspace(conn);

    if (!workspace) {
      throw new Error(
        `No workspace found for company=${companyId} (workspace_id=${conn.workspace_id ?? 'null'}, base_url=${conn.base_url ?? 'null'})`,
      );
    }

    const adminRole = await this.roleRepository.findOne({
      where: {
        workspaceId: workspace.id,
        universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
      },
    });

    if (!adminRole) {
      throw new Error(`No Admin role found for workspace=${workspace.id}`);
    }

    // Reuse the existing BTI key entity if present — token is re-derivable.
    const existing = (
      await this.apiKeyService.findActiveByWorkspaceId(workspace.id)
    ).find((key) => key.name === BTI_API_KEY_NAME);

    const expiresAt = existing?.expiresAt ?? addDays(new Date(), NEVER_EXPIRE_DAYS);

    const apiKey =
      existing ??
      (await this.apiKeyService.create({
        name: BTI_API_KEY_NAME,
        expiresAt,
        workspaceId: workspace.id,
        roleId: adminRole.id,
      }));

    const tokenResult = await this.apiKeyService.generateApiKeyToken(
      workspace.id,
      apiKey.id,
      expiresAt,
    );

    if (!tokenResult?.token) {
      throw new Error(
        `Token generation failed for workspace=${workspace.id}, apiKey=${apiKey.id}`,
      );
    }

    const { error: updateError } = await this.supabaseAuthClient.client
      .from('hub_connections')
      .update({
        api_key: tokenResult.token,
        workspace_id: workspace.id,
        subdomain: workspace.subdomain,
        status: 'connected',
        error_count: 0,
        last_error: null,
      })
      .eq('company_id', companyId)
      .eq('hub_type', 'crm')
      .eq('platform', 'twenty-hosted');

    if (updateError) {
      throw new Error(
        `hub_connections api_key write-back failed for company=${companyId}: ${updateError.message}`,
      );
    }

    this.logger.log(
      `BTI api key provisioned: company=${companyId}, workspace=${workspace.id}, apiKey=${apiKey.id} (${existing ? 'reused' : 'created'})`,
    );

    return { workspaceId: workspace.id };
  }

  // workspace_id when set; otherwise fall back to the subdomain — either the
  // stored one or the first host label of base_url (https://inter-inc.crm.…).
  private async resolveWorkspace(conn: {
    workspace_id: string | null;
    subdomain: string | null;
    base_url: string | null;
  }): Promise<WorkspaceEntity | null> {
    if (conn.workspace_id) {
      const byId = await this.workspaceRepository.findOne({
        where: { id: conn.workspace_id },
      });

      if (byId) {
        return byId;
      }
    }

    let subdomain = conn.subdomain?.trim();

    if (!subdomain && conn.base_url) {
      try {
        const host = new URL(conn.base_url).hostname;
        const firstLabel = host.split('.')[0];

        // 'crm' means the apex (crm.w144.com) — not a workspace subdomain.
        if (firstLabel && firstLabel !== 'crm') {
          subdomain = firstLabel;
        }
      } catch {
        // ignore malformed base_url
      }
    }

    if (!subdomain) {
      return null;
    }

    return await this.workspaceRepository.findOne({ where: { subdomain } });
  }
}
