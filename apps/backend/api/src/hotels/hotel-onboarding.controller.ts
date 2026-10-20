import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { HotelOnboardingService } from '@ethio-tour/backend-domain';
import type { RegistryActor } from '@ethio-tour/backend-domain';

import { CurrentActor } from '../auth/current-actor.decorator';
import { KeycloakAuthGuard } from '../auth/keycloak-auth.guard';
// Keep DTOs as runtime imports for Nest's validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  DecideHotelAdmissionDto,
  DecideHotelApplicationDto,
  CreateHotelApplicationDto,
  SubmitHotelApplicationDto,
  UpdateHotelApplicationDto,
} from './hotel-onboarding.dto';
import { HotelOnboardingExceptionFilter } from './hotel-onboarding-exception.filter';

@Controller('hotels')
@UseGuards(KeycloakAuthGuard)
@UseFilters(HotelOnboardingExceptionFilter)
export class HotelApplicationsController {
  constructor(@Inject(HotelOnboardingService) private readonly hotels: HotelOnboardingService) {}

  @Get('applications')
  listMine(@CurrentActor() actor: RegistryActor) {
    return this.hotels.listMyApplications(actor);
  }

  @Post('applications')
  create(@CurrentActor() actor: RegistryActor, @Body() request: CreateHotelApplicationDto) {
    return this.hotels.createApplication(actor, request);
  }

  @Get('applications/:applicationId')
  getMine(
    @CurrentActor() actor: RegistryActor,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.hotels.getMyApplication(actor, applicationId);
  }

  @Post('applications/:applicationId/revisions')
  updateDraft(
    @CurrentActor() actor: RegistryActor,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() request: UpdateHotelApplicationDto,
  ) {
    return this.hotels.updateDraft(actor, applicationId, request.expectedVersion, request.content);
  }

  @Post('applications/:applicationId/submit')
  submit(
    @CurrentActor() actor: RegistryActor,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() request: SubmitHotelApplicationDto,
  ) {
    return this.hotels.submitApplication(actor, applicationId, request.expectedVersion);
  }

  @Get('workspace/:applicationId')
  workspace(
    @CurrentActor() actor: RegistryActor,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.hotels.getProviderWorkspace(actor, applicationId);
  }
}

@Controller('bureau/hotel-cases')
@UseGuards(KeycloakAuthGuard)
@UseFilters(HotelOnboardingExceptionFilter)
export class BureauHotelCasesController {
  constructor(@Inject(HotelOnboardingService) private readonly hotels: HotelOnboardingService) {}

  @Get()
  list(@CurrentActor() actor: RegistryActor) {
    return this.hotels.listBureauCases(actor);
  }

  @Post(':caseId/decision')
  decide(
    @CurrentActor() actor: RegistryActor,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() request: DecideHotelApplicationDto,
  ) {
    return this.hotels.decideBureauCase(actor, caseId, request);
  }
}

@Controller('admin/hotel-admissions')
@UseGuards(KeycloakAuthGuard)
@UseFilters(HotelOnboardingExceptionFilter)
export class AdministratorHotelAdmissionsController {
  constructor(@Inject(HotelOnboardingService) private readonly hotels: HotelOnboardingService) {}

  @Get()
  list(@CurrentActor() actor: RegistryActor) {
    return this.hotels.listAdmissionQueue(actor);
  }

  @Post(':applicationId/decision')
  decide(
    @CurrentActor() actor: RegistryActor,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() request: DecideHotelAdmissionDto,
  ) {
    return this.hotels.decideAdmission(actor, applicationId, request);
  }
}
