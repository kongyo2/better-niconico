import { defineConfig } from 'vite'
import { resolve } from 'path'
import { crx, ManifestV3Export } from '@crxjs/vite-plugin'
import tsconfigPaths from 'vite-tsconfig-paths'
import { stripDevIcons } from './custom-vite-plugins'
import manifest from './manifest.json'
import devManifest from './manifest.dev.json'
import pkg from './package.json'

const isDev = process.env.__DEV__ === 'true' || process.env.NODE_ENV === 'development'

// Merge base manifest with dev-specific overrides
const fullManifest: ManifestV3Export = {
  ...manifest,
  ...(isDev ? devManifest : {}),
  version: pkg.version,
} as ManifestV3Export

export default defineConfig({
  plugins: [
    tsconfigPaths(), // Enable path aliases from tsconfig.json
    crx({
      manifest: fullManifest,
      browser: 'chrome',
      contentScripts: {
        injectCss: true,
      }
    }),
    stripDevIcons(isDev), // Remove dev icons from production build
  ],
  build: {
    outDir: 'dist',
    sourcemap: isDev,
    emptyOutDir: !isDev,
    minify: !isDev,
  },
  publicDir: resolve(__dirname, 'public'),
})
