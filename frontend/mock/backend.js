// In-memory stand-in for the Spring Boot auth API, following the contract in
// src/api/auth.js. Development and tests only; never bundled into the app.

export const SEED_STORES = [
  { id: '1', name: 'Blue Plate Diner', address: '412 Main St' },
  { id: '2', name: 'Harbor Noodle House', address: '88 Wharf Ave' },
  { id: '3', name: 'Corner Bakery Co.', address: '1500 Grand Blvd' },
]

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLES = ['inspector', 'owner']

export function createMockBackend({ stores = SEED_STORES } = {}) {
  const users = new Map()

  function publicUser({ password: _password, ...user }) {
    return user
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

    const key = body.email.toLowerCase()
    if (users.has(key)) return { status: 409, body: { message: 'Email is already registered.' } }

    const user = {
      id: users.size + 1,
      name: body.name.trim(),
      email: body.email,
      role: body.role,
      storeId: body.role === 'owner' ? store.id : null,
      storeName: body.role === 'owner' ? store.name : null,
      password: body.password,
    }
    users.set(key, user)
    return { status: 201, body: publicUser(user) }
  }

  function login(body) {
    const user = users.get(String(body.email ?? '').toLowerCase())
    if (!user || user.password !== body.password) {
      return { status: 401, body: { message: 'Invalid email or password.' } }
    }
    return { status: 200, body: { token: crypto.randomUUID(), user: publicUser(user) } }
  }

  return {
    handle(method, path, body = {}) {
      if (method === 'GET' && path === '/api/stores') {
        return { status: 200, body: stores.toSorted((a, b) => a.name.localeCompare(b.name)) }
      }
      if (method === 'POST' && path === '/api/auth/register') return register(body)
      if (method === 'POST' && path === '/api/auth/login') return login(body)
      return { status: 404, body: { message: 'Not found.' } }
    },
  }
}
