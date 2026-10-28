import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import { BtiApiKeyProvisioningService } from 'src/engine/core-modules/auth/services/bti-api-key-provisioning.service';
import {
  SUPABASE_AUTH_CLIENT,
  type SupabaseAuthClient,
} from 'src/engine/core-modules/auth/services/supabase-auth-client.provider';
import { W144OpportunityLostStageService } from 'src/engine/core-modules/auth/services/w144-opportunity-lost-stage.service';

export type W144BackfillResult = {
  minted: string[];
  failed: string[];
  lostStage: string[];
};

// The engine key and the Lost stage for workspaces set up before the CRM made
// them itself. Until now a key was made only when a W144 owner or admin opened
// the CRM, and while W144's sign-in is closed nobody can: a company linked to
// a workspace before keys were made never got one, so the engine never read
// its pipeline. On each start the server makes the key for every hosted
// workspace already linked to a company that has none, and adds the Lost
// stage where it is missing. A company with no linked workspace is left
// alone: its workspace is set up when its owner or admin first opens the CRM.
@Injectable()
export class W144EngineKeyBackfillService implements OnApplicationBootstrap {
  private readonly logger = new Logger(W144EngineKeyBackfillService.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    @Inject(SUPABASE_AUTH_CLIENT)
    private readonly supabaseAuthClient: SupabaseAuthClient,
    private readonly btiApiKeyProvisioningService: BtiApiKeyProvisioningService,
    private readonly w144OpportunityLostStageService: W144OpportunityLostStageService,
  ) {}

  onApplicationBootstrap(): void {
    // the server only: the queue worker loads this module too, and two
    // processes making a key at once would leave two keys
    if (!this.httpAdapterHost?.httpAdapter) {
      return;
    }

    void this.run().catch((error) => {
      this.logger.warn(
        `Engine key backfill failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async run(): Promise<W144BackfillResult> {
    const result: W144BackfillResult = { minted: [], failed: [], lostStage: [] };

    const { data, error } = await this.supabaseAuthClient.client
      .from('hub_connections')
      .select('company_id, workspace_id, api_key')
      .eq('hub_type', 'crm')
      .eq('platform', 'twenty-hosted')
      .not('workspace_id', 'is', null);

    if (error) {
      throw new Error(`hub_connections lookup failed: ${error.message}`);
    }

    const linked = (data ?? []) as {
      company_id: string;
      workspace_id: string;
      api_key: string | null;
    }[];

    for (const connection of linked) {
      if (!connection.api_key) {
        try {
          await this.btiApiKeyProvisioningService.mintForCompany(
            connection.company_id,
          );
          result.minted.push(connection.company_id);
        } catch (mintError) {
          result.failed.push(connection.company_id);
          this.logger.warn(
            `Engine key backfill: no key for company=${connection.company_id}: ${mintError instanceof Error ? mintError.message : String(mintError)}`,
          );
        }
      }

      try {
        const lost = await this.w144OpportunityLostStageService.ensureLostStage(
          connection.workspace_id,
        );

        if (lost.status === 'added') {
          result.lostStage.push(connection.workspace_id);
        }
      } catch (lostError) {
        this.logger.warn(
          `Engine key backfill: Lost stage not added in workspace=${connection.workspace_id}: ${lostError instanceof Error ? lostError.message : String(lostError)}`,
        );
      }
    }

    if (result.minted.length || result.failed.length || result.lostStage.length) {
      this.logger.log(
        `Engine key backfill: keys made for ${result.minted.length}, failed for ${result.failed.length}, Lost stage added in ${result.lostStage.length}`,
      );
    }

    return result;
  }
}
