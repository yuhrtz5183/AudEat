import { createMockBackend } from './backend.js'

// Serves /api/* from the in-memory mock while the real API is not configured.
export default function mockApi() {
  const backend = createMockBackend()

  return {
    name: 'audeat-mock-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next()

        const body = await readJson(req)
        const result = body === undefined
          ? { status: 400, body: { message: 'Malformed JSON.' } }
          : backend.handle(req.method, req.url.split('?')[0], body)

        res.statusCode = result.status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result.body))
      })
    },
  }
}

async function readJson(req) {
  let text = ''
  for await (const chunk of req) text += chunk
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
