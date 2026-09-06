import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  test: {
    include: ['test/**/*.spec.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./test.db',
      APP_SECRET: 'test-app-secret-32+characters-long!!',
      ALLOW_OPEN_SIGNUP: 'true',
      COOKIE_SECURE: 'false',
    },
  },
});
