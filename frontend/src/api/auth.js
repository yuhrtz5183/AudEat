import { request } from './client.js'

/*
 * Contract expected from the Spring Boot API (role is 'inspector' or 'owner'):
 *
 *   POST /api/auth/register  { name, email, password, role, storeId? }
 *     201 { id, name, email, role, storeId, storeName }
 *     400 { errors: { [field]: message } } for invalid fields
 *     409 when the email is already registered
 *
 *   POST /api/auth/login  { email, password }
 *     200 { token, user: { id, name, email, role, storeId, storeName } }
 *     401 for a wrong password or an unregistered email (same response for both)
 *
 *   GET /api/stores  (public, used by registration)
 *     200 [{ id, name, address }]
 */

/** Creates an account from the registration form values. */
export function register(values) {
  return request('/api/auth/register', {
    method: 'POST',
    body: {
      name: values.name.trim(),
      email: values.email.trim(),
      password: values.password,
      role: values.role,
      storeId: values.role === 'owner' ? values.storeId : null,
    },
  })
}

/** Exchanges credentials for a session: { token, user }. */
export function login({ email, password }) {
  return request('/api/auth/login', {
    method: 'POST',
    body: { email: email.trim(), password },
  })
}

/** Lists the stores a store owner can register against. */
export function fetchStores() {
  return request('/api/stores')
}
