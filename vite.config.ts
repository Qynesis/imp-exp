import { spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const API_PORT = 8787
const api = { '/api': `http://localhost:${API_PORT}` }
const at = (p: string) => fileURLToPath(new URL(p, import.meta.url))

const portInUse = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.once('connect', () => {
      s.destroy()
      resolve(true)
    })
    s.once('error', () => resolve(false))
  })

/** With VITE_BACKEND=server, starting Vite also starts the books server, so /api always has something to talk to. */
function booksServer(): Plugin {
  let child: ChildProcess | undefined
  return {
    name: 'books-server',
    apply: 'serve',
    async configureServer(server) {
      if (process.env.VITE_BACKEND !== 'server' || (await portInUse(API_PORT))) return
      child = spawn('npx', ['tsx', 'watch', 'server/main.ts'], { stdio: 'inherit', env: { DEMO_ACCOUNTS: '1', ...process.env, PORT: String(API_PORT) } })
      child.on('exit', (code) => code && server.config.logger.error(`The books server stopped (exit ${code}). Run it on its own with: npm run server`))
      const stop = () => child?.kill()
      server.httpServer?.once('close', stop)
      process.once('exit', stop)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), booksServer()],
  resolve: {
    alias: { '@': at('./src'), '@shared': at('./shared') },
  },
  server: { proxy: api },
  preview: { proxy: api },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
