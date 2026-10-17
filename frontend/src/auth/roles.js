// Landing page for each role after login.
export const ROLE_HOME = {
  inspector: '/stores',
  owner: '/my-store',
}

export function isRole(role) {
  return Object.hasOwn(ROLE_HOME, role)
}
