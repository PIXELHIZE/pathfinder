import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 4173 },
  oxc: { jsx: { runtime: 'automatic' } },
});
