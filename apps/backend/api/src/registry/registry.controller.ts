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

import { RegistryService } from '@ethio-tour/backend-domain';

import { CurrentActor } from '../auth/current-actor.decorator';
import { KeycloakAuthGuard } from '../auth/keycloak-auth.guard';
import type { RegistryActor } from '@ethio-tour/backend-domain';
// Keep DTOs as runtime imports for Nest's validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  CreateAttractionDto,
  CreateDestinationDto,
  CreateRevisionDto,
  ReviewRevisionDto,
  SubmitRevisionDto,
  WithdrawPublicationDto,
} from './registry.dto';
import { RegistryExceptionFilter } from './registry-exception.filter';

@Controller('registry')
@UseGuards(KeycloakAuthGuard)
@UseFilters(RegistryExceptionFilter)
export class RegistryController {
  constructor(@Inject(RegistryService) private readonly registry: RegistryService) {}

  @Post('destinations')
  createDestination(@CurrentActor() actor: RegistryActor, @Body() request: CreateDestinationDto) {
    return this.registry.createDestination(actor, request);
  }

  @Post('attractions')
  createAttraction(@CurrentActor() actor: RegistryActor, @Body() request: CreateAttractionDto) {
    return this.registry.createAttraction(actor, request);
  }

  @Get(':id')
  getPrivateResource(
    @CurrentActor() actor: RegistryActor,
    @Param('id', ParseUUIDPipe) resourceId: string,
  ) {
    return this.registry.getPrivateResource(actor, resourceId);
  }

  @Post(':id/revisions')
  createRevision(
    @CurrentActor() actor: RegistryActor,
    @Param('id', ParseUUIDPipe) resourceId: string,
    @Body() request: CreateRevisionDto,
  ) {
    return this.registry.createRevision(
      actor,
      resourceId,
      request.expectedVersion,
      request.content,
    );
  }

  @Post(':id/submit')
  submitRevision(
    @CurrentActor() actor: RegistryActor,
    @Param('id', ParseUUIDPipe) resourceId: string,
    @Body() request: SubmitRevisionDto,
  ) {
    return this.registry.submitRevision(
      actor,
      resourceId,
      request.revisionId,
      request.expectedVersion,
    );
  }

  @Post(':id/review')
  reviewRevision(
    @CurrentActor() actor: RegistryActor,
    @Param('id', ParseUUIDPipe) resourceId: string,
    @Body() request: ReviewRevisionDto,
  ) {
    return this.registry.reviewRevision(
      actor,
      resourceId,
      request.revisionId,
      request.expectedVersion,
      request.decision,
      request.reason,
    );
  }

  @Post(':id/publish')
  publishRevision(
    @CurrentActor() actor: RegistryActor,
    @Param('id', ParseUUIDPipe) resourceId: string,
    @Body() request: SubmitRevisionDto,
  ) {
    return this.registry.publishRevision(
      actor,
      resourceId,
      request.revisionId,
      request.expectedVersion,
    );
  }

  @Post(':id/withdraw')
  withdrawPublication(
    @CurrentActor() actor: RegistryActor,
    @Param('id', ParseUUIDPipe) resourceId: string,
    @Body() request: WithdrawPublicationDto,
  ) {
    return this.registry.withdrawPublication(
      actor,
      resourceId,
      request.expectedVersion,
      request.reason,
    );
  }
}
