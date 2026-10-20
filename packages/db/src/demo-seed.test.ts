import { describe, expect, it } from 'vitest';

import { demoActorKeys } from './demo-seed';

describe('synthetic registry role map', () => {
  it('provides distinct editor, reviewer and publisher actor slots at each demo level and area', () => {
    const scopes = [
      'federal',
      'regional-a',
      'regional-b',
      'woreda-gondar',
      'woreda-lalibela',
      'kebele-gondar',
      'kebele-lalibela',
    ];
    const roles = ['editor', 'reviewer', 'publisher'];

    expect(demoActorKeys).toHaveLength(scopes.length * roles.length + 2);
    for (const scope of scopes) {
      for (const role of roles) expect(demoActorKeys).toContain(`${scope}.${role}`);
    }
    expect(demoActorKeys).toContain('hotel-bureau.reviewer');
    expect(demoActorKeys).toContain('platform.hotel-admin');
  });
});
