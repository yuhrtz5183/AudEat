import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client.js'
import { submitEvidence } from '../api/owner.js'
import { IMAGE_ACCEPT, MAX_COMMENT_LENGTH, evidenceFiles, validateEvidence } from './evidence.js'

const FIELDS = ['comment', 'files']
const FIELD_IDS = { comment: 'evidence-comment', files: 'evidence-files' }
const NOT_WAITING = 'This ticket is not waiting for evidence.'

/** Only the ticket statuses that wait for the owner's evidence (DESIGN §1). */
export function acceptsEvidence(ticket) {
  return ticket.status === 'open' || ticket.status === 'rejected'
}

function focusFirstError(errors) {
  const field = FIELDS.find((name) => errors[name])
  if (field) document.getElementById(FIELD_IDS[field])?.focus()
}

// Maps a failed submission to field errors, or null when it is not field-specific.
function serverFieldErrors(error) {
  if (!(error instanceof ApiError) || error.status !== 400 || !error.body?.errors) return null
  const known = Object.entries(error.body.errors).filter(([field]) => FIELDS.includes(field))
  return known.length > 0 ? Object.fromEntries(known) : null
}

// Any other failure is shown above the button; a 409 offers to reload the ticket.
function formErrorOf(error) {
  if (!(error instanceof ApiError)) return { message: "Couldn't send your evidence. Please try again." }
  if (error.status === 409) {
    // The other 409 is the backend's optimistic lock, which has its own message.
    const message = error.body?.message
    return {
      message: !message || message === NOT_WAITING ? 'This ticket is no longer waiting for evidence.' : message,
      reload: true,
    }
  }
  if (error.status === 404) return { message: 'Ticket not found. It may have been removed.' }
  if (error.status === 413) return { message: 'Each file must be 5 MB or smaller.' }
  return { message: "Couldn't send your evidence. Please try again." }
}

function FieldError({ id, error }) {
  return error ? <p id={`${id}-error`} className="error">{error}</p> : null
}

/**
 * The owner's remediation evidence (US 5): a comment and 1-5 photos. Everything is checked
 * before the request (AC 5.2); on success `onSent` gets the updated ticket (AC 5.1).
 */
export default function EvidenceForm({ ticket, onSent, onReload }) {
  const formRef = useRef(null)
  const [comment, setComment] = useState('')
  const [files, setFiles] = useState([])
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [pending, setPending] = useState(false)
  const alertRef = useRef(null)

  useEffect(() => {
    // The disabled button lost focus while sending; put it on the message, just before
    // "Reload the ticket" and the button, so the keyboard does not start over from the top.
    if (formError) alertRef.current?.focus()
  }, [formError])

  function clearError(field) {
    if (errors[field]) setErrors(({ [field]: _cleared, ...rest }) => rest)
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setFormError(null)
    try {
      const nextErrors = await validateEvidence({ comment, files })
      setErrors(nextErrors)
      if (Object.keys(nextErrors).length > 0) {
        focusFirstError(nextErrors)
        return
      }
      const updated = await submitEvidence(ticket.id, { comment: comment.trim(), files: evidenceFiles(files) })
      formRef.current?.reset()
      setComment('')
      setFiles([])
      onSent(updated)
    } catch (error) {
      const fieldErrors = serverFieldErrors(error)
      if (fieldErrors) {
        setErrors(fieldErrors)
        focusFirstError(fieldErrors)
      } else {
        setFormError(formErrorOf(error))
      }
    } finally {
      setPending(false)
    }
  }

  const commentId = FIELD_IDS.comment
  const filesId = FIELD_IDS.files

  return (
    <section className="ticket-section evidence-form" aria-labelledby="evidence-form-heading">
      <h2 id="evidence-form-heading">Send evidence of the fix</h2>
      <p className="lede">
        {ticket.status === 'rejected'
          ? "Send new evidence that answers the inspector's comment."
          : 'Describe what you changed and add photos that show it. The inspector will review them.'}
      </p>

      <form ref={formRef} onSubmit={onSubmit} noValidate>
        <div className={errors.comment ? 'field invalid' : 'field'}>
          <label htmlFor={commentId}>How did you fix the issue?</label>
          <textarea
            id={commentId}
            name="comment"
            rows={4}
            maxLength={MAX_COMMENT_LENGTH}
            value={comment}
            onChange={(event) => {
              setComment(event.target.value)
              clearError('comment')
            }}
            aria-invalid={errors.comment ? 'true' : 'false'}
            aria-describedby={errors.comment ? `${commentId}-error` : `${commentId}-hint`}
          />
          {errors.comment ? null : (
            <p id={`${commentId}-hint`} className="hint">
              Up to {MAX_COMMENT_LENGTH} characters.
            </p>
          )}
          <FieldError id={commentId} error={errors.comment} />
        </div>

        <div className={errors.files ? 'field invalid' : 'field'}>
          <label htmlFor={filesId}>Photos of the fix</label>
          <input
            id={filesId}
            name="files"
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            onChange={(event) => {
              setFiles(Array.from(event.target.files ?? []))
              clearError('files')
            }}
            aria-invalid={errors.files ? 'true' : 'false'}
            aria-describedby={errors.files ? `${filesId}-error` : `${filesId}-hint`}
          />
          {errors.files ? null : (
            <p id={`${filesId}-hint`} className="hint">
              JPEG, PNG or WebP. Up to 5 photos, 5 MB each.
            </p>
          )}
          <FieldError id={filesId} error={errors.files} />
        </div>

        {formError ? (
          <div className="alert" role="alert" tabIndex={-1} ref={alertRef}>
            <p>{formError.message}</p>
            {formError.reload ? (
              <p>
                <button
                  type="button"
                  className="text-button"
                  onClick={async () => {
                    // If the ticket still takes evidence the form stays; drop the stale message.
                    await onReload()
                    setFormError(null)
                  }}
                >
                  Reload the ticket
                </button>{' '}
                to see its current status.
              </p>
            ) : null}
          </div>
        ) : null}

        <button type="submit" className="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Sending…' : 'Send evidence'}
        </button>
      </form>
    </section>
  )
}
