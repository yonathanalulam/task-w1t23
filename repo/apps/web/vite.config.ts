import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const configuredHosts = (process.env.VITE_ALLOWED_HOSTS ?? 'web')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    allowedHosts: ['localhost', '127.0.0.1', ...configuredHosts]
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts']
  }
});
