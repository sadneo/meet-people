import { mergeConfig, type Plugin } from 'vite'
import config from './vite.config.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = dirname(fileURLToPath(import.meta.url))
const bootMarkup = readFileSync(join(directory, 'src/ui/loading/boot-markup.html'), 'utf8')
const bootCss = readFileSync(join(directory, 'src/ui/loading/boot-loading.css'), 'utf8')

export const mobileEntry: Plugin = {
  name: 'mobile-entry',
  transformIndexHtml: {
    order: 'pre',
    handler: html => html.replace('/src/main.tsx', '/src/mobile/main.tsx')
      .replace('</head>', `<style data-pebble-boot>${bootCss}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root">${bootMarkup}</div>`),
  },
}

export default mergeConfig(config, {
  plugins: [mobileEntry],
  build: { outDir: 'dist/mobile' },
  server: { port: Number(process.env.VITE_PORT ?? 3002) },
  preview: { port: Number(process.env.VITE_PREVIEW_PORT ?? 4174) },
})
