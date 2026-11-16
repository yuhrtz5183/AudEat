import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { requestBlob } from '../api/client.js'

// An <img src> cannot send the bearer token, so the photo is fetched as a Blob
// and shown through an object URL that is revoked on unmount.
// Clicking the thumbnail opens a full-size preview modal portalled to body.
export default function Photo({ id, alt }) {
  const [state, setState] = useState({ status: 'loading', src: null })
  const [open, setOpen] = useState(false)

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

  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (state.status === 'error') return <span className="lede">Photo unavailable</span>
  if (state.status === 'loading') return <span className="lede">Loading photo…</span>

  const modal = open
    ? createPortal(
        <div
          className="photo-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setOpen(false)}
        >
          <div className="photo-modal-content" onClick={(event) => event.stopPropagation()}>
            <img src={state.src} alt={alt} className="photo-modal-img" />
            <button
              type="button"
              className="photo-modal-close"
              onClick={() => setOpen(false)}
              aria-label="Close photo preview"
            >
              ✕
            </button>
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <button
        type="button"
        className="photo-thumbnail-btn"
        onClick={() => setOpen(true)}
        aria-label={`View full photo: ${alt}`}
      >
        <img src={state.src} alt={alt} />
      </button>
      {modal}
    </>
  )
}
