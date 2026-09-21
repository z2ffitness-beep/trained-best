import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Runs the /api functions during `npm run dev`.
//
// Vite only serves the frontend. `api/chat.js` is a Vercel serverless function,
// so in local dev a POST to /api/chat matched no route, fell through to the SPA
// rewrite, and came back as the index.html page — the AI code then tried to
// parse HTML as JSON and every program generation failed locally, while working
// fine once deployed. This mounts the same handler on the dev server so local
// behaviour matches production.
//
// It does nothing during `vite build`; production still uses Vercel's runtime.
function devApiRoutes(env) {
  return {
    name: 'dev-api-routes',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()

        // Vercel functions read secrets from process.env; in dev those live in
        // .env.local, which Vite parses but does not put on process.env itself.
        for (const [k, v] of Object.entries(env)) {
          if (process.env[k] === undefined) process.env[k] = v
        }

        const route = req.url.split('?')[0].replace(/^\/api\//, '').replace(/\/$/, '')
        let handler
        try {
          const mod = await server.ssrLoadModule(`/api/${route}.js`)
          handler = mod.default
        } catch {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ error: `No API route /api/${route}` }))
        }

        // Collect and parse the body the way Vercel does before invoking.
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        const raw = Buffer.concat(chunks).toString('utf8')
        try {
          req.body = raw ? JSON.parse(raw) : {}
        } catch {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        }

        // Minimal shim for the Vercel response helpers the handler uses.
        res.status = (code) => { res.statusCode = code; return res }
        res.json = (payload) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(payload))
          return res
        }

        try {
          await handler(req, res)
        } catch (err) {
          console.error(`[dev-api] /api/${route} threw:`, err)
          if (!res.writableEnded) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Internal server error' }))
          }
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // '' loads every variable, not just the VITE_-prefixed ones, so the server
  // side of dev can see ANTHROPIC_API_KEY.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), devApiRoutes(env)],
    server: {
      port: 3000,
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 5000,
    },
  }
})
