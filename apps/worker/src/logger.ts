type Level = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

function write(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export function createLogger(base: Record<string, unknown> = {}): Logger {
  return {
    debug: (message, fields) => write('debug', message, { ...base, ...fields }),
    info: (message, fields) => write('info', message, { ...base, ...fields }),
    warn: (message, fields) => write('warn', message, { ...base, ...fields }),
    error: (message, fields) => write('error', message, { ...base, ...fields }),
  };
}
