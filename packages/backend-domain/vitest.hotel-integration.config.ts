import { defineConfig } from 'vitest/config';

process.env.HOTEL_PILOT_TEST_REQUIRED = 'true';

export default defineConfig({
  test: {
    // These suites mutate a shared active-release pointer and test DDL guards.
    fileParallelism: false,
    include: [
      'src/hotels/hotel-onboarding.integration.test.ts',
      'src/hotels/hotel-location-directory.integration.test.ts',
      'src/hotels/hotel-directory-upgrade.integration.test.ts',
    ],
    reporters: ['verbose'],
  },
});
