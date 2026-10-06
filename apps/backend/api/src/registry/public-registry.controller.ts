import { Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';

import { RegistryService } from '@ethio-tour/backend-domain';

@Controller('public')
export class PublicRegistryController {
  constructor(@Inject(RegistryService) private readonly registry: RegistryService) {}

  @Get('destinations')
  async listDestinations() {
    return { items: await this.registry.listPublicDestinations() };
  }

  @Get('destinations/:id')
  async getDestination(@Param('id', ParseUUIDPipe) resourceId: string) {
    const destination = await this.registry.getPublicDestination(resourceId);
    if (!destination) throw new NotFoundException();
    return destination;
  }

  @Get('attractions')
  async listAttractions() {
    return { items: await this.registry.listPublicAttractions() };
  }

  @Get('attractions/:id')
  async getAttraction(@Param('id', ParseUUIDPipe) resourceId: string) {
    const attraction = await this.registry.getPublicAttraction(resourceId);
    if (!attraction) throw new NotFoundException();
    return attraction;
  }
}
