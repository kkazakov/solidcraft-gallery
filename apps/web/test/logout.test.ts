import { describe, expect, it, vi } from 'vitest';
import { POST } from '../src/routes/auth/logout/+server.js';

function logoutEvent(origin = 'http://localhost') {
  const cookies = {
    get: vi.fn(() => undefined),
    set: vi.fn(),
    delete: vi.fn(),
  };
  return {
    event: {
      request: new Request('http://localhost/auth/logout', {
        method: 'POST',
        headers: { origin },
      }),
      cookies,
      url: new URL('http://localhost/auth/logout'),
    } as never,
    cookies,
  };
}

describe('POST /auth/logout', () => {
  it('clears the language preference cookie as well as the session', async () => {
    const { event, cookies } = logoutEvent();

    await expect(POST(event)).rejects.toMatchObject({ status: 303, location: '/' });

    expect(cookies.delete).toHaveBeenCalledWith('gallery-language', { path: '/' });
  });

  it('does not clear anything for a cross-origin submit', async () => {
    const { event, cookies } = logoutEvent('https://evil.example');

    await expect(POST(event)).rejects.toMatchObject({ status: 303, location: '/' });

    expect(cookies.delete).not.toHaveBeenCalled();
  });
});
