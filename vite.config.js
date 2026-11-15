import { spawn } from 'node:child_process'
import net from 'node:net'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_PORT = 8787
const api = { '/api': `http://localhost:${API_PORT}` }

const portInUse = (port) => new Promise((resolve) => {
  const s = net.connect(port, '127.0.0.1')
  s.once('connect', () => { s.destroy(); resolve(true) })
  s.once('error', () => resolve(false))
})

/** The app needs the books server. Starting Vite on its own starts the server too, so "/api" always has something to talk to. */
function booksServer() {
  let child
  return {
    name: 'books-server',
    apply: 'serve',
    async configureServer(server) {
      if (await portInUse(API_PORT)) return
      child = spawn('node', ['--watch', 'server/index.js'], { stdio: 'inherit', env: { DEMO_ACCOUNTS: '1', ...process.env, PORT: String(API_PORT) } })
      child.on('exit', (code) => code && server.config.logger.error(`The books server stopped (exit ${code}). Sign-in will not work until it runs again: npm run server`))
      const stop = () => child && child.kill()
      server.httpServer?.once('close', stop)
      process.once('exit', stop)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), booksServer()],
  server: { proxy: api },
  preview: { proxy: api },
})
