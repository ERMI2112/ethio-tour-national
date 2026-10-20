import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { CreateHotelApplicationDto, HotelApplicationContentDto } from './hotel-onboarding.dto';

describe('hotel application request boundary', () => {
  it('strips client-supplied owner, Bureau route, organization and synthetic fields', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const body = {
      content: {
        claimedHotelName: 'Synthetic lodging example',
        applicantNotes: 'No official claim.',
        ownerProfileId: 'forged-profile',
        organizationId: 'forged-org',
        isSynthetic: false,
      },
      bureauOrganizationId: 'forged-bureau',
      administrativeUnitId: 'forged-scope',
      applicantProfileId: 'forged-owner',
      isSynthetic: false,
    };

    const result = (await pipe.transform(body, {
      type: 'body',
      metatype: CreateHotelApplicationDto,
    })) as CreateHotelApplicationDto;

    expect(result).toBeInstanceOf(CreateHotelApplicationDto);
    expect(result).toEqual({
      content: {
        claimedHotelName: 'Synthetic lodging example',
        applicantNotes: 'No official claim.',
      },
    });
    expect(result.content).toBeInstanceOf(HotelApplicationContentDto);
  });
});
