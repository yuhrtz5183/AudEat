import { useEffect, useState } from 'react'
import { requestBlob } from '../api/client.js'

// An <img src> cannot send the bearer token, so the photo is fetched as a Blob
// and shown through an object URL that is revoked on unmount.
export default function Photo({ id, alt }) {
  const [state, setState] = useState({ status: 'loading', src: null })

  useEffect(() => {
    let active = true
    let src = null
    setState({ status: 'loading', src: null })
    requestBlob(`/api/photos/${id}`).then(
      (blob) => {
        if (!active) return
        src = URL.createObjectURL(blob)
        setState({ status: 'ready', src })
      },
      () => {
        if (active) setState({ status: 'error', src: null })
      },
    )
    return () => {
      active = false
      if (src) URL.revokeObjectURL(src)
    }
  }, [id])

  if (state.status === 'error') return <span className="lede">Photo unavailable</span>
  if (state.status === 'loading') return <span className="lede">Loading photo…</span>
  return <img src={state.src} alt={alt} />
}
