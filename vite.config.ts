/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In development the dashboard calls /api/... and Vite forwards it to the
// QWED server, so the browser never needs a CORS exception for localhost.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.QWED_API_URL || 'http://localhost:8000';

  return {
    plugins: [react()],
    // An inline PostCSS config stops Vite searching parent folders for a
    // postcss.config.js, so a config in a home or workspace folder (for
    // example one that loads Tailwind) never reaches this build.
    css: { postcss: {} },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    test: {
      // Logic tests run in Node. Component tests opt into a DOM with a
      // `@vitest-environment jsdom` comment at the top of the file.
      environment: 'node',
      include: ['src/**/*.test.{ts,tsx}'],
      // Typing with user-event under coverage can pass the 5-second default.
      testTimeout: 15000,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
        reporter: ['text-summary', 'lcov'],
      },
    },
  };
});
