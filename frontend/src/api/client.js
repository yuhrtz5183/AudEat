import { readSession } from '../auth/session.js'

// Empty in development so requests hit the Vite dev server (mock API or proxy).
const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/**
 * Sends a request to the AudEat API and returns the parsed JSON response body.
 * A FormData body is sent as multipart; any other body is sent as JSON.
 * Throws ApiError for non-2xx responses; network failures reject with the fetch error.
 */
export async function request(path, { method = 'GET', body } = {}) {
  const init = { method, headers: { Accept: 'application/json' } }
  if (body instanceof FormData) {
    // fetch sets the multipart Content-Type, including its boundary.
    init.body = body
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  const response = await send(path, init)

  const data = parseJson(await response.text())
  if (!response.ok) throw new ApiError(response.status, data)
  return data
}

/** Fetches a binary resource, such as a photo, with the session's bearer token. */
export async function requestBlob(path) {
  const response = await send(path, { method: 'GET', headers: {} })
  if (!response.ok) throw new ApiError(response.status, parseJson(await response.text()))
  return response.blob()
}

function send(path, init) {
  const token = readSession()?.token
  if (token) init.headers.Authorization = `Bearer ${token}`
  return fetch(`${BASE_URL}${path}`, init)
}

function parseJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
