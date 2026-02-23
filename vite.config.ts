import { defineConfig } from 'vite';
import { resolve } from 'path';
import webExtension from 'vite-plugin-web-extension';
import tsconfigPaths from 'vite-tsconfig-paths';
import { stripDevIcons } from './custom-vite-plugins';
import manifest from './manifest.json';
import devManifest from './manifest.dev.json';
import pkg from './package.json';

const isDev = process.env.__DEV__ === 'true' || process.env.NODE_ENV === 'development';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    webExtension({
      manifest: () => ({
        ...manifest,
        ...(isDev ? devManifest : {}),
        version: pkg.version,
      }),
      browser: 'firefox',
    }),
    stripDevIcons(isDev),
  ],
  build: {
    outDir: 'dist',
    sourcemap: isDev,
    emptyOutDir: !isDev,
    minify: !isDev,
  },
  publicDir: resolve(__dirname, 'public'),
});
