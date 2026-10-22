import { describe, expect, it } from 'vitest';
import { detectDesignKind } from '../src/detect.js';

const enc = new TextEncoder();

describe('detectDesignKind', () => {
  it('detects a ZIP local header', () => {
    expect(detectDesignKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBe('container');
  });

  it('detects JSON after whitespace and a BOM', () => {
    expect(detectDesignKind(enc.encode('  \n{"schema":1}'))).toBe('json');
    expect(detectDesignKind(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]))).toBe('json');
  });

  it('rejects other bytes', () => {
    expect(detectDesignKind(enc.encode('solid\n'))).toBe('unknown');
    expect(detectDesignKind(new Uint8Array())).toBe('unknown');
  });
});
