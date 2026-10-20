import { defineConfig } from 'vitest/config';

process.env.HOTEL_PILOT_TEST_REQUIRED = 'true';

export default defineConfig({
  test: {
    include: ['src/hotels/hotel-onboarding.integration.test.ts'],
    reporters: ['verbose'],
  },
});
