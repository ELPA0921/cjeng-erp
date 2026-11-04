import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// pdf.js reads character maps (Korean PDFs need them), standard fonts and image decoders from
// these folders while it draws a PDF, so they are served as they are under /pdfjs/.
const pdfjsRoot = fileURLToPath(new URL('./node_modules/pdfjs-dist/', import.meta.url))
const pdfjsFolders = ['cmaps', 'standard_fonts', 'wasm']

function pdfjsFiles(): Plugin {
  return {
    name: 'pdfjs-files',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const path = normalize(join(pdfjsRoot, decodeURIComponent((req.url ?? '').split('?')[0])))
        if (!pdfjsFolders.some(folder => path.startsWith(join(pdfjsRoot, folder) + sep)) || !statSync(path, { throwIfNoEntry: false })?.isFile()) { next(); return }
        res.end(readFileSync(path))
      })
    },
    generateBundle() {
      for (const folder of pdfjsFolders) {
        for (const name of readdirSync(join(pdfjsRoot, folder))) this.emitFile({ type: 'asset', fileName: `pdfjs/${folder}/${name}`, source: readFileSync(join(pdfjsRoot, folder, name)) })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pdfjsFiles()],
})
