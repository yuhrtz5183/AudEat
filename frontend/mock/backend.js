// In-memory stand-in for the Spring Boot API, following the contract in src/api/ and
// DESIGN §4. Development and tests only; never bundled into the app.

import { HttpError, createTables, findById, localToday, publicUser } from './data.js'
import { inspectorRoutes } from './routes/inspector.js'
import { ownerRoutes } from './routes/owner.js'
import { sharedRoutes } from './routes/shared.js'
import { MOCK_TOKENS, MOCK_USERS, SEED_STORES, seedDatabase } from './seed.js'

export { SEED_STORES }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLES = ['inspector', 'owner']
const ROUTES = [...sharedRoutes, ...ownerRoutes, ...inspectorRoutes]

/** `today` ('YYYY-MM-DD') pins the date the seed and the derived values are relative to. */
export function createMockBackend({ stores = SEED_STORES, today } = {}) {
  const db = createTables(stores)
  seedDatabase(db, today ?? localToday())
  const sessions = new Map(Object.entries(MOCK_TOKENS).map(([key, token]) => [token, MOCK_USERS[key].id]))

  function findUser(email) {
    return db.users.find((user) => user.email.toLowerCase() === String(email ?? '').toLowerCase())
  }

  function register(body) {
    const errors = {}
    const store = stores.find((item) => String(item.id) === String(body.storeId))
    if (!body.name?.trim()) errors.name = 'Name is required.'
    if (!EMAIL.test(body.email ?? '')) errors.email = 'Email is invalid.'
    if ((body.password ?? '').length < 8) errors.password = 'Password must be at least 8 characters.'
    if (!ROLES.includes(body.role)) errors.role = 'Role is required.'
    if (body.role === 'owner' && !store) errors.storeId = 'Store is required.'
    if (Object.keys(errors).length > 0) return { status: 400, body: { errors } }

    if (findUser(body.email)) return { status: 409, body: { message: 'Email is already registered.' } }

    const user = db.insert('users', {
      name: body.name.trim(),
      email: body.email,
      role: body.role,
      storeId: body.role === 'owner' ? store.id : null,
      storeName: body.role === 'owner' ? store.name : null,
      password: body.password,
    })
    return { status: 201, body: publicUser(user) }
  }

  function login(body) {
    const user = findUser(body.email)
    if (!user || user.password !== body.password) {
      return { status: 401, body: { message: 'Invalid email or password.' } }
    }
    const token = crypto.randomUUID()
    sessions.set(token, user.id)
    return { status: 200, body: { token, user: publicUser(user) } }
  }

  function sessionUser(authorization) {
    const token = /^Bearer (.+)$/.exec(authorization ?? '')?.[1]
    return token === undefined ? undefined : findById(db.users, sessions.get(token))
  }

  return {
    db,
    // Synchronous on purpose: StrictMode's double effects then see each other's writes.
    handle(method, url, body = {}, { authorization } = {}) {
      const { pathname, searchParams } = new URL(url, 'http://mock')
      if (method === 'GET' && pathname === '/api/stores') {
        return { status: 200, body: stores.toSorted((a, b) => a.name.localeCompare(b.name)) }
      }
      if (method === 'POST' && pathname === '/api/auth/register') return register(body)
      if (method === 'POST' && pathname === '/api/auth/login') return login(body)

      const route = ROUTES.find((item) => item.method === method && item.pattern.test(pathname))
      if (!route) return { status: 404, body: { message: 'Not found.' } }
      const user = sessionUser(authorization)
      if (!user) return { status: 401, body: { message: 'Authentication required.' } }
      if (route.role !== 'any' && route.role !== user.role) {
        return { status: 403, body: { message: 'You are not authorized to view this page.' } }
      }

      const ctx = { db, user, today: today ?? localToday() }
      try {
        return route.handler(ctx, route.pattern.exec(pathname).groups ?? {}, body, searchParams)
      } catch (error) {
        if (error instanceof HttpError) return { status: error.status, body: error.body }
        throw error
      }
    },
  }
}
