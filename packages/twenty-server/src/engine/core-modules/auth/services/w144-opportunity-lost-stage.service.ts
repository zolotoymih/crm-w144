import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import {
  type FieldMetadataComplexOption,
  FieldMetadataType,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';
import { v4 } from 'uuid';

import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';

export const W144_LOST_STAGE_VALUE = 'LOST';

export const W144_LOST_STAGE_LABEL = 'Lost';

export type W144LostStageResult =
  | { status: 'added'; optionId: string }
  | { status: 'already-present' }
  | { status: 'no-stage-field' };

// Every W144 company workspace gets an opportunity stage "Lost" after the last
// stage (Customer), so the engine can count lost deals. Customer stays the won
// stage. Twenty's standard metadata is left untouched (upstream sync compares
// it); the option is added through the same updateOneField path the Settings
// data model screen uses, which also creates the board view groups for it.
// Idempotent: does nothing when an option with value LOST already exists.
@Injectable()
export class W144OpportunityLostStageService {
  private readonly logger = new Logger(W144OpportunityLostStageService.name);

  constructor(
    @InjectRepository(FieldMetadataEntity)
    private readonly fieldMetadataRepository: Repository<FieldMetadataEntity>,
    private readonly fieldMetadataService: FieldMetadataService,
  ) {}

  async ensureLostStage(workspaceId: string): Promise<W144LostStageResult> {
    const stageField = await this.fieldMetadataRepository.findOne({
      where: {
        workspaceId,
        name: 'stage',
        type: FieldMetadataType.SELECT,
        object: { nameSingular: 'opportunity' },
      },
    });

    if (!isDefined(stageField)) {
      this.logger.warn(
        `No opportunity.stage field in workspace=${workspaceId}, Lost stage not added`,
      );

      return { status: 'no-stage-field' };
    }

    const options = (stageField.options ?? []) as FieldMetadataComplexOption[];

    if (options.some((option) => option.value === W144_LOST_STAGE_VALUE)) {
      return { status: 'already-present' };
    }

    const lastPosition = options.reduce(
      (highest, option) => Math.max(highest, option.position),
      -1,
    );

    const optionId = v4();

    const lostOption: FieldMetadataComplexOption = {
      id: optionId,
      value: W144_LOST_STAGE_VALUE,
      label: W144_LOST_STAGE_LABEL,
      position: lastPosition + 1,
      color: 'gray',
    };

    await this.fieldMetadataService.updateOneField({
      updateFieldInput: {
        id: stageField.id,
        options: [...options, lostOption],
      },
      workspaceId,
    });

    this.logger.log(
      `Lost stage added: workspace=${workspaceId}, option=${optionId}`,
    );

    return { status: 'added', optionId };
  }
}
