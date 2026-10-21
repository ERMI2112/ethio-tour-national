import { BadRequestException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';

// Guards inspect raw JSON before the application-wide whitelist pipe runs.
@Injectable()
export class HotelRequestBodyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ method: string; body?: unknown; query?: unknown }>();
    const handler = context.getHandler().name;
    if (request.method === 'GET' && handler === 'locations') {
      this.assertKeys(request.query, ['query', 'language', 'limit', 'cursor']);
      return true;
    }
    if (request.method !== 'POST') return true;
    const keys =
      handler === 'create'
        ? ['content']
        : handler === 'updateDraft'
          ? ['expectedVersion', 'content']
          : handler === 'submit'
            ? ['expectedVersion']
            : ['expectedVersion', 'decision', 'reason'];
    this.assertKeys(request.body, keys);
    if (handler === 'create' || handler === 'updateDraft') {
      this.assertKeys((request.body as Record<string, unknown>).content, [
        'claimedHotelName',
        'applicantNotes',
        'administrativeUnitId',
        'locationSelection',
      ]);
      const content = (request.body as Record<string, unknown>).content as Record<string, unknown>;
      if (content.locationSelection !== undefined) {
        this.assertKeys(content.locationSelection, [
          'geographyReleaseId',
          'unitId',
          'unitRevisionId',
        ]);
      }
    }
    return true;
  }

  private assertKeys(value: unknown, keys: string[]): void {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !keys.includes(key))
    ) {
      throw new BadRequestException('Invalid hotel request fields.');
    }
  }
}
