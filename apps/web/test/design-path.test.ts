import { describe, expect, it } from 'vitest';
import { isDesignPath } from '../src/lib/server/design-path.js';

describe('isDesignPath', () => {
  it('accepts the current .sc extension and the legacy .solidcraft extension', () => {
    expect(isDesignPath('designs/case.sc')).toBe(true);
    expect(isDesignPath('designs/case.solidcraft')).toBe(true);
  });

  it('is case-insensitive and rejects other files', () => {
    expect(isDesignPath('designs/CASE.SC')).toBe(true);
    expect(isDesignPath('designs/case.step')).toBe(false);
    expect(isDesignPath('designs/case')).toBe(false);
    expect(isDesignPath('designs/case.sc.bak')).toBe(false);
  });
});
