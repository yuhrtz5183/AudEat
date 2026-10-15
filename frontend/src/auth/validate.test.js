import { describe, expect, it } from 'vitest'
import { validateAuth } from './validate.js'

const SIGNUP = {
  name: 'Ada Inspector',
  email: 'ada@example.com',
  password: 'correct-horse',
  confirm: 'correct-horse',
  role: 'inspector',
  storeId: '',
}

describe('validateAuth (AC 12.3)', () => {
  it('accepts a complete inspector registration', () => {
    expect(validateAuth('signup', SIGNUP)).toEqual({})
  })

  it('accepts a store owner who selected a store', () => {
    expect(validateAuth('signup', { ...SIGNUP, role: 'owner', storeId: '2' })).toEqual({})
  })

  it('flags every missing field', () => {
    const empty = { name: ' ', email: '', password: '', confirm: '', role: '', storeId: '' }
    expect(validateAuth('signup', empty)).toEqual({
      name: 'Enter your full name.',
      email: 'Enter your email.',
      password: 'Enter your password.',
      confirm: 'Confirm your password.',
      role: 'Choose inspector or store owner.',
    })
  })

  it('rejects a badly formatted email', () => {
    expect(validateAuth('signup', { ...SIGNUP, email: 'ada@example' }).email).toBe('Enter a valid email address.')
  })

  it('rejects a password under 8 characters and accepts exactly 8', () => {
    const short = { ...SIGNUP, password: 'seven77', confirm: 'seven77' }
    const exact = { ...SIGNUP, password: 'eight888', confirm: 'eight888' }
    expect(validateAuth('signup', short).password).toBe('Use at least 8 characters.')
    expect(validateAuth('signup', exact).password).toBeUndefined()
  })

  it('requires a store owner to choose a store', () => {
    expect(validateAuth('signup', { ...SIGNUP, role: 'owner' }).storeId).toBe('Choose your store.')
  })

  it('rejects mismatched passwords', () => {
    expect(validateAuth('signup', { ...SIGNUP, confirm: 'different!' }).confirm).toBe('Passwords do not match.')
  })
})

describe('validateAuth for sign in', () => {
  it('only requires an email and password, without the length rule', () => {
    expect(validateAuth('signin', { email: 'ada@example.com', password: 'short' })).toEqual({})
    expect(validateAuth('signin', { email: '', password: '' })).toEqual({
      email: 'Enter your email.',
      password: 'Enter your password.',
    })
  })
})
