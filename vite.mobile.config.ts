import { mergeConfig, type Plugin } from 'vite'
import config from './vite.config.js'

export const mobileEntry: Plugin = {
  name: 'mobile-entry',
  transformIndexHtml: {
    order: 'pre',
    handler: html => html.replace('/src/main.tsx', '/src/mobile/main.tsx'),
  },
}

export default mergeConfig(config, {
  plugins: [mobileEntry],
  build: { outDir: 'dist/mobile' },
  server: { port: Number(process.env.VITE_PORT ?? 3002) },
  preview: { port: Number(process.env.VITE_PREVIEW_PORT ?? 4174) },
})
