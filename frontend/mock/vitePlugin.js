import { Readable } from 'node:stream'
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

        const body = await readBody(req)
        const result = body === undefined
          ? { status: 400, body: { message: 'Malformed JSON.' } }
          : backend.handle(req.method, req.url, body, { authorization: req.headers.authorization })

        res.statusCode = result.status
        if (result.blob) {
          res.setHeader('Content-Type', result.blob.type)
          res.setHeader('Cache-Control', 'private, max-age=86400')
          res.setHeader('Vary', 'Authorization')
          res.end(Buffer.from(await result.blob.arrayBuffer()))
          return
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result.body))
      })
    },
  }
}

// Multipart bodies become a FormData, as the browser sent them; anything else is JSON.
async function readBody(req) {
  const contentType = req.headers['content-type'] ?? ''
  if (contentType.startsWith('multipart/form-data')) {
    try {
      return await new Request(`http://mock${req.url}`, {
        method: req.method,
        headers: { 'content-type': contentType },
        body: Readable.toWeb(req),
        duplex: 'half',
      }).formData()
    } catch {
      return undefined
    }
  }

  let text = ''
  for await (const chunk of req) text += chunk
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
