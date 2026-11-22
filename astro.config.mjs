import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import node from '@astrojs/node';

// src/pages/studio/ and src/pages/api/studio/ are gitignored — they exist
// on this machine but are never committed, so a fresh clone (e.g. Vercel's
// build) never has them. That file presence, not an env var, decides the
// build shape: Studio present -> hybrid output + the node adapter, so its
// routes can read/write the filesystem; Studio absent -> a plain static
// site with no adapter, since nothing left needs server rendering.
const studioPresent = existsSync(fileURLToPath(new URL('./src/pages/studio', import.meta.url)));

export default defineConfig({
  site: 'https://example.com',
  output: studioPresent ? 'hybrid' : 'static',
  adapter: studioPresent ? node({ mode: 'standalone' }) : undefined,
  integrations: studioPresent ? [mdx(), react()] : [mdx()],
});
