import { Type } from 'class-transformer';
import { IsDefined, IsIn, IsInt, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

import type { HotelAdmissionDecision, HotelApplicationDecision } from '@ethio-tour/contracts';

export class HotelApplicationContentDto {
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
