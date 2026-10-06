import { Type } from 'class-transformer';
import {
  IsIn,
  IsDefined,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import type { ReviewDecision } from '@ethio-tour/contracts';

export class EditorialContentDto {
  @IsDefined()
  @IsString()
  @MaxLength(180)
  title!: string;

  @IsDefined()
  @IsString()
  @MaxLength(2000)
  summary!: string;
}

export class CreateDestinationDto {
  @IsDefined()
  @IsString()
  @MaxLength(100)
  organizationId!: string;

  @IsDefined()
  @IsString()
  @MaxLength(100)
  administrativeUnitId!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => EditorialContentDto)
  content!: EditorialContentDto;
}

export class CreateAttractionDto extends CreateDestinationDto {
  @IsUUID('4')
  destinationId!: string;
}

export class CreateRevisionDto {
  @IsDefined()
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsDefined()
  @ValidateNested()
  @Type(() => EditorialContentDto)
  content!: EditorialContentDto;
}

export class SubmitRevisionDto {
  @IsDefined()
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsDefined()
  @IsUUID('4')
  revisionId!: string;
}

export class ReviewRevisionDto extends SubmitRevisionDto {
  @IsDefined()
  @IsIn(['approve', 'request_changes', 'reject'])
  decision!: ReviewDecision;

  @IsDefined()
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class WithdrawPublicationDto {
  @IsDefined()
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsDefined()
  @IsString()
  @MaxLength(1000)
  reason!: string;
}
