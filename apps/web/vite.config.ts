import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Inlined into the server bundle so the footer can report the release time.
const BUILT_AT = new Date().toISOString();

export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({ out: 'build' }),
    }),
  ],
  define: {
    __SITE_BUILT_AT__: JSON.stringify(BUILT_AT),
  },
  server: { port: 5173, strictPort: true },
});
