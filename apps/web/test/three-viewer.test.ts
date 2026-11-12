import { describe, expect, it } from 'vitest';
import { fitDistance } from '../src/lib/three-viewer.js';

describe('fitDistance', () => {
  it('fits the height of a tall model to the vertical field of view', () => {
    const distance = fitDistance(1, 10, 90, 1, 1);
    expect(distance).toBeCloseTo(10, 5);
  });

  it('fits the width of a wide model to the horizontal field of view', () => {
    const distance = fitDistance(10, 1, 90, 2, 1);
    expect(distance).toBeCloseTo(10 / 2, 5);
  });

  it('pulls back for a narrow field of view and a narrow viewport', () => {
    expect(fitDistance(5, 5, 30, 1)).toBeGreaterThan(fitDistance(5, 5, 60, 1));
    expect(fitDistance(5, 5, 45, 0.6)).toBeGreaterThan(fitDistance(5, 5, 45, 1.6));
  });

  it('applies the padding factor', () => {
    expect(fitDistance(5, 5, 45, 1, 1.5)).toBeCloseTo(fitDistance(5, 5, 45, 1, 1) * 1.5, 5);
  });

  it('rejects impossible inputs', () => {
    expect(() => fitDistance(0, 0, 45, 1)).toThrow();
    expect(() => fitDistance(-1, 2, 45, 1)).toThrow();
    expect(() => fitDistance(1, 1, 0, 1)).toThrow();
    expect(() => fitDistance(1, 1, 180, 1)).toThrow();
    expect(() => fitDistance(1, 1, 45, 0)).toThrow();
  });
});
