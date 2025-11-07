import fs from 'fs'
import { resolve } from 'path'
import type { PluginOption } from 'vite'

/**
 * Plugin to remove dev icons from production build
 * This keeps the production bundle clean and smaller
 */
export function stripDevIcons(isDev: boolean): PluginOption {
  if (isDev) return null

  return {
    name: 'strip-dev-icons',
    renderStart(outputOptions: any) {
      const outDir = outputOptions.dir
      if (!outDir) return

      // List of dev-only files to remove from production builds
      const devFiles = [
        'dev-icon-16.png',
        'dev-icon-32.png',
        'dev-icon-48.png',
        'dev-icon-128.png',
      ]

      devFiles.forEach((file) => {
        const filePath = resolve(outDir, file)
        fs.rm(filePath, { force: true }, (err) => {
          if (!err) {
            console.log(`Removed ${file} from production build`)
          }
        })
      })
    },
  }
}
