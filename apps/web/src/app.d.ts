import type { Locale } from './lib/i18n/config';

declare global {
  namespace App {
    interface Locals {
      requestId: string;
      locale: Locale;
    }
  }
}

export {};
