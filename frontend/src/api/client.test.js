import { describe, expect, it, vi } from 'vitest'
import { request, requestBlob } from './client.js'

function stubFetch(response) {
  const fetch = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('request', () => {
  it('sends a FormData body as is, without a JSON Content-Type', async () => {
    const fetch = stubFetch(Response.json({ id: 5 }, { status: 201 }))
    const body = new FormData()
    body.append('comment', 'Fixed')

    await expect(request('/api/upload', { method: 'POST', body })).resolves.toEqual({ id: 5 })

    const [, init] = fetch.mock.calls[0]
    expect(init.body).toBe(body)
    expect(init.headers['Content-Type']).toBeUndefined()
  })
})

describe('requestBlob', () => {
  it('returns the response body as a Blob and sends the bearer token', async () => {
    const fetch = stubFetch(new Response('png', { headers: { 'Content-Type': 'image/png' } }))
    sessionStorage.setItem('audeat.session', JSON.stringify({ token: 't1', user: { role: 'owner' } }))

    const blob = await requestBlob('/api/photos/5')

    expect(blob.type).toBe('image/png')
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer t1')
  })

  it('throws ApiError with the JSON message on failure', async () => {
    stubFetch(Response.json({ message: 'Photo not found.' }, { status: 404 }))

    await expect(requestBlob('/api/photos/99')).rejects.toEqual(
      expect.objectContaining({ name: 'ApiError', status: 404, message: 'Photo not found.' }),
    )
  })
})
