import { describe, expect, it } from 'vitest';
import { cameraDistance } from '../src/lib/three-viewer.js';

describe('cameraDistance', () => {
  it('places the camera far enough for the sphere to fit the vertical field of view', () => {
    const distance = cameraDistance(10, 90, 1);
    expect(distance).toBeCloseTo(10 / Math.sin(Math.PI / 4), 5);
  });

  it('pulls back for a narrow field of view and pads by default', () => {
    expect(cameraDistance(10, 30)).toBeGreaterThan(cameraDistance(10, 60));
    expect(cameraDistance(10, 45, 1.2)).toBeCloseTo(cameraDistance(10, 45, 1) * 1.2, 5);
  });

  it('rejects impossible inputs', () => {
    expect(() => cameraDistance(0, 45)).toThrow();
    expect(() => cameraDistance(-1, 45)).toThrow();
    expect(() => cameraDistance(1, 0)).toThrow();
    expect(() => cameraDistance(1, 180)).toThrow();
  });
});
