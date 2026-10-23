import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Inlined into the server bundle so the footer can report the release time.
const BUILT_AT = new Date().toISOString();

// SvelteKit uses paths.origin as the trusted origin for form submissions.
// The production image is built with PUBLIC_ORIGIN; local builds leave it unset.
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN?.trim() || undefined;

export default defineConfig({
  plugins: [
    sveltekit({
      ...(PUBLIC_ORIGIN ? { paths: { origin: PUBLIC_ORIGIN } } : {}),
      preprocess: vitePreprocess(),
      adapter: adapter({ out: 'build' }),
    }),
  ],
  define: {
    __SITE_BUILT_AT__: JSON.stringify(BUILT_AT),
  },
  server: { port: 5173, strictPort: true },
});
