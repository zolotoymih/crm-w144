import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import {
  SUPABASE_AUTH_CLIENT,
  type SupabaseAuthClient,
} from 'src/engine/core-modules/auth/services/supabase-auth-client.provider';
import { WorkspaceService } from 'src/engine/core-modules/workspace/services/workspace.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';

export type W144WorkspaceErasure = {
  erased: boolean;
  reason?: 'not_waiting' | 'company_exists' | 'still_connected' | 'not_found';
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /w144/workspaces/erase { workspaceId }: a company was erased in W144
// (Settings, Delete the company, thirty days on), so its hosted CRM workspace
// goes too: members, data, files, the whole workspace, as Twenty deletes one.
//
// The engine asks; the shared database decides. The engine writes the
// workspace into company_erasure_leftovers just before it erases the company
// (bti-engine migration 040, lib/w144/erasure.ts), and only the engine's
// server can write there. Here the workspace is erased only when all three
// hold:
//   1. it waits there, not cleared yet;
//   2. its company is gone from companies;
//   3. no hub_connections row and no crm_workspace_kept row names it.
// So the route needs no key: whoever calls it can only bring forward an
// erasure W144 already decided. A workspace Twenty does not have any more
// answers not_found, which the engine takes as done.
@Controller('w144')
export class W144WorkspaceEraseController {
  private readonly logger = new Logger(W144WorkspaceEraseController.name);

  constructor(
    private readonly workspaceService: WorkspaceService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    @Inject(SUPABASE_AUTH_CLIENT)
    private readonly supabaseAuthClient: SupabaseAuthClient,
  ) {}

  @Post('workspaces/erase')
  @HttpCode(200)
  @UseGuards(PublicEndpointGuard, NoPermissionGuard)
  async erase(
    @Body() body: { workspaceId?: string },
  ): Promise<W144WorkspaceErasure> {
    const workspaceId = body?.workspaceId?.trim() ?? '';

    if (!UUID.test(workspaceId)) {
      throw new BadRequestException('workspaceId is required');
    }

    const db = this.supabaseAuthClient.client;

    const { data: waiting, error: waitingError } = await db
      .from('company_erasure_leftovers')
      .select('erased_company')
      .eq('kind', 'crm_workspace')
      .eq('ref', workspaceId)
      .is('done_at', null)
      .maybeSingle();

    if (waitingError) {
      throw new Error(`erasure list: ${waitingError.message}`);
    }
    if (!isDefined(waiting)) {
      return { erased: false, reason: 'not_waiting' };
    }

    const [company, connection, kept] = await Promise.all([
      db
        .from('companies')
        .select('id')
        .eq('id', waiting.erased_company)
        .maybeSingle(),
      db
        .from('hub_connections')
        .select('id')
        .eq('workspace_id', workspaceId)
        .limit(1),
      db
        .from('crm_workspace_kept')
        .select('company_id')
        .eq('workspace_id', workspaceId)
        .limit(1),
    ]);

    const failed = [company, connection, kept].find((r) => r.error);

    if (isDefined(failed) && isDefined(failed.error)) {
      throw new Error(`W144 check: ${failed.error.message}`);
    }
    if (isDefined(company.data)) {
      return { erased: false, reason: 'company_exists' };
    }
    if ((connection.data ?? []).length > 0 || (kept.data ?? []).length > 0) {
      return { erased: false, reason: 'still_connected' };
    }

    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
      withDeleted: true,
    });

    if (!isDefined(workspace)) {
      return { erased: false, reason: 'not_found' };
    }

    await this.workspaceService.deleteWorkspace(workspaceId, false);

    this.logger.log(
      `W144 erase: workspace=${workspaceId} of erased company=${waiting.erased_company} deleted`,
    );

    return { erased: true };
  }
}
