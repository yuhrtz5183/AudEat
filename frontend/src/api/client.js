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
 * Sends a JSON request to the AudEat API and returns the parsed response body.
 * Throws ApiError for non-2xx responses; network failures reject with the fetch error.
 */
export async function request(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' }
  const init = { method, headers }
  const token = readSession()?.token
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  const response = await fetch(`${BASE_URL}${path}`, init)

  const data = parseJson(await response.text())
  if (!response.ok) throw new ApiError(response.status, data)
  return data
}

function parseJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
