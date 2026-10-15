import { useEffect, useState } from 'react'
import { fetchStores } from '../api/auth.js'

// Loads the store list once it is needed; retry() refetches after a failure.
export function useStores(enabled) {
  const [state, setState] = useState({ status: 'idle', items: [] })
  const [attempt, setAttempt] = useState(0)
  const loaded = state.status === 'ready'

  useEffect(() => {
    if (!enabled || loaded) return undefined
    let active = true
    setState({ status: 'loading', items: [] })
    fetchStores().then(
      (items) => {
        if (active) setState({ status: 'ready', items })
      },
      () => {
        if (active) setState({ status: 'error', items: [] })
      },
    )
    return () => {
      active = false
    }
  }, [enabled, loaded, attempt])

  return { ...state, retry: () => setAttempt((current) => current + 1) }
}
