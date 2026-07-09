import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';

import { timingSafeEqual } from 'crypto';

import { type Request } from 'express';

import { BtiApiKeyProvisioningService } from 'src/engine/core-modules/auth/services/bti-api-key-provisioning.service';

// Internal machine-to-machine endpoint for the BTI engine (app.w144.com).
// Auth: the engine presents the shared Supabase service key as a Bearer token;
// we compare it against our own SUPABASE_SERVICE_KEY env — both sides already
// hold this secret (it's how each talks to the shared Supabase), so no new
// secret needs to be provisioned anywhere.
@Controller('bti-internal')
export class BtiInternalController {
  constructor(
    private readonly btiApiKeyProvisioningService: BtiApiKeyProvisioningService,
  ) {}

  @Post('mint-api-key')
  @HttpCode(200)
  async mintApiKey(
    @Req() request: Request,
    @Body() body: { company_id?: string },
  ): Promise<{ ok: true; workspace_id: string }> {
    this.assertServiceKey(request);

    const companyId = body?.company_id?.trim();

    if (!companyId) {
      throw new BadRequestException('company_id is required');
    }

    const { workspaceId } =
      await this.btiApiKeyProvisioningService.mintForCompany(companyId);

    return { ok: true, workspace_id: workspaceId };
  }

  private assertServiceKey(request: Request): void {
    const serviceKey = process.env.SUPABASE_SERVICE_KEY?.trim();

    if (!serviceKey) {
      throw new UnauthorizedException('SUPABASE_SERVICE_KEY not configured');
    }

    const header = request.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice(7) : '';

    const expected = Buffer.from(serviceKey);
    const actual = Buffer.from(presented);

    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new UnauthorizedException('Invalid internal credentials');
    }
  }
}
