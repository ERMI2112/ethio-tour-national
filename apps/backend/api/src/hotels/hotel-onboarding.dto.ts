import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import type { HotelAdmissionDecision, HotelApplicationDecision } from '@ethio-tour/contracts';

export class HotelLocationSelectionDto {
  @IsDefined()
  @IsString()
  @MaxLength(100)
  geographyReleaseId!: string;

  @IsDefined()
  @IsString()
  @MaxLength(200)
  unitId!: string;

  @IsDefined()
  @IsString()
  @MaxLength(100)
  @IsUUID()
  unitRevisionId!: string;
}

export class HotelLocationSearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  query?: string;

  @IsOptional()
  @IsString()
  @MaxLength(35)
  language?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;
}

export class HotelApplicationContentDto {
  /** Legacy field accepted only when preserving a pre-directory private draft. */
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  administrativeUnitId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @ValidateNested()
  @Type(() => HotelLocationSelectionDto)
  locationSelection?: HotelLocationSelectionDto;

  @IsDefined()
  @IsString()
  @MaxLength(160)
  claimedHotelName!: string;

  @IsDefined()
  @IsString()
  @MaxLength(2000)
  applicantNotes!: string;
}

export class CreateHotelApplicationDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => HotelApplicationContentDto)
  content!: HotelApplicationContentDto;
}

export class UpdateHotelApplicationDto {
  @IsDefined()
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsDefined()
  @ValidateNested()
  @Type(() => HotelApplicationContentDto)
  content!: HotelApplicationContentDto;
}

export class SubmitHotelApplicationDto {
  @IsDefined()
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class DecideHotelApplicationDto {
  @IsDefined()
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsDefined()
  @IsIn(['approve', 'request_changes', 'reject'])
  decision!: HotelApplicationDecision;

  @IsDefined()
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class DecideHotelAdmissionDto {
  @IsDefined()
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsDefined()
  @IsIn(['admit', 'decline'])
  decision!: HotelAdmissionDecision;

  @IsDefined()
  @IsString()
  @MaxLength(1000)
  reason!: string;
}
