import { json } from '@sveltejs/kit';
import { isAppError, toErrorBody } from '@gallery/core';

/** One error envelope for every JSON route; unknown errors never leak details. */
export function errorResponse(error: unknown, requestId?: string) {
  if (isAppError(error)) {
    return json(toErrorBody(error), { status: error.status });
  }
  console.error('unhandled route error', { requestId, error });
  return json(toErrorBody(error), { status: 500 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('body must be a JSON object');
    }
    return value as Record<string, unknown>;
  } catch {
    const { AppError } = await import('@gallery/core');
    throw new AppError('validation_failed', 'request body must be a JSON object');
  }
}
