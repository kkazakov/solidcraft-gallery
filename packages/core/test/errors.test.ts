import { describe, expect, it } from 'vitest';
import { AppError, isAppError, toErrorBody } from '../src/errors.js';

describe('AppError', () => {
  it('maps a code to its HTTP status and body', () => {
    const error = new AppError('not_found', 'No such project');
    expect(error.status).toBe(404);
    expect(toErrorBody(error)).toEqual({
      error: { code: 'not_found', message: 'No such project' },
    });
  });

  it('keeps details when present', () => {
    const error = new AppError('payload_too_large', 'Too big', { limit: 10 });
    expect(toErrorBody(error).error.details).toEqual({ limit: 10 });
  });

  it('does not leak unknown errors', () => {
    const body = toErrorBody(new Error('database password is hunter2'));
    expect(body.error.code).toBe('internal');
    expect(body.error.message).not.toContain('hunter2');
  });

  it('recognizes AppError', () => {
    expect(isAppError(new AppError('conflict', 'x'))).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
  });
});
