import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom cannot make object URLs; photos are shown through them.
URL.createObjectURL = vi.fn(() => `blob:mock/${crypto.randomUUID()}`)
URL.revokeObjectURL = vi.fn()

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
  sessionStorage.clear()
})
