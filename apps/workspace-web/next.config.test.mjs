import { expect, it } from 'vitest';
import nextConfig from './next.config.mjs';

it('transpiles the local API client for workspace development builds', () => {
  expect(nextConfig.transpilePackages).toContain('@ethio-tour/api-client');
});
