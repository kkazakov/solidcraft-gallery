import { describe, expect, it } from 'vitest';
import { retryDelaySeconds } from '../src/jobs.js';

describe('retryDelaySeconds', () => {
  it('starts at 30 seconds and doubles', () => {
    expect(retryDelaySeconds(1)).toBe(30);
    expect(retryDelaySeconds(2)).toBe(60);
    expect(retryDelaySeconds(3)).toBe(120);
  });

  it('caps at 15 minutes', () => {
    expect(retryDelaySeconds(10)).toBe(900);
    expect(retryDelaySeconds(100)).toBe(900);
  });

  it('never returns zero or a negative delay', () => {
    expect(retryDelaySeconds(0)).toBe(30);
    expect(retryDelaySeconds(-5)).toBe(30);
  });
});
