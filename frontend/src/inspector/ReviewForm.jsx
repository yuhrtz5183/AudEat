import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client.js'
import { reviewTicket } from '../api/inspector.js'

const DECISIONS = [
  { value: 'approved', label: 'Approve' },
  { value: 'rejected', label: 'Reject' },
  { value: 'follow_up', label: 'Schedule a follow-up' },
]

function validate({ decision, comment, followUpDate }, today) {
  const errors = {}
  const text = comment.trim()
  if (!decision) errors.decision = 'Choose approved, rejected, or a follow-up.'
  if (text.length > 1000) errors.comment = 'Use 1000 characters or fewer.'
  else if (decision === 'rejected' && text === '') {
    errors.comment = 'Explain why further action is required.'
  }
  if (decision === 'follow_up') {
    if (!followUpDate) errors.followUpDate = 'A follow-up date is required.'
    else if (followUpDate <= today) errors.followUpDate = 'The follow-up date must be in the future.'
  }
  return errors
}

function serverErrors(error) {
  if (!(error instanceof ApiError) || error.status !== 400 || !error.body?.errors) return null
  return error.body.errors
}

function FieldError({ id, error }) {
  return error ? (
    <p id={id} className="error">{error}</p>
  ) : null
}

/**
 * The decision on evidence waiting for review (US 6). On success `onReviewed` receives the
 * updated ticket.
 */
export default function ReviewForm({ ticketId, onReviewed }) {
  const [decision, setDecision] = useState('')
  const [comment, setComment] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [pending, setPending] = useState(false)
  const alertRef = useRef(null)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (formError) alertRef.current?.focus()
  }, [formError])

  async function onSubmit(event) {
    event.preventDefault()
    if (pending) return
    const nextErrors = validate({ decision, comment, followUpDate }, today)
    setErrors(nextErrors)
    setFormError(null)
    if (Object.keys(nextErrors).length > 0) {
      const field = ['decision', 'comment', 'followUpDate'].find((name) => nextErrors[name])
      document.getElementById(`review-${field}`)?.focus()
      return
    }
    setPending(true)
    try {
      const updated = await reviewTicket(ticketId, {
        decision,
        comment: comment.trim(),
        followUpDate: decision === 'follow_up' ? followUpDate : null,
      })
      onReviewed(updated)
    } catch (error) {
      const fields = serverErrors(error)
      if (fields) {
        setErrors(fields)
      } else if (error instanceof ApiError && error.status === 409) {
        setFormError(error.body?.message ?? 'This ticket has no evidence waiting for review.')
      } else {
        setFormError("Couldn't record the decision. Please try again.")
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="review-form" onSubmit={onSubmit} noValidate>
      <fieldset className={errors.decision ? 'invalid' : undefined}>
        <legend>Decision</legend>
        <div className="choice-row">
          {DECISIONS.map((option) => (
            <label key={option.value} className="choice">
              <input
                id={option.value === 'approved' ? 'review-decision' : undefined}
                type="radio"
                name="decision"
                value={option.value}
                checked={decision === option.value}
                onChange={() => {
                  setDecision(option.value)
                  setErrors(({ decision: _cleared, ...rest }) => rest)
                }}
              />
              {option.label}
            </label>
          ))}
        </div>
        <FieldError id="review-decision-error" error={errors.decision} />
      </fieldset>

      <div className={errors.comment ? 'field invalid' : 'field'}>
        <label htmlFor="review-comment">
          Comment{decision === 'rejected' ? '' : ' (optional)'}
        </label>
        <textarea
          id="review-comment"
          value={comment}
          onChange={(event) => {
            setComment(event.target.value)
            setErrors(({ comment: _cleared, ...rest }) => rest)
          }}
          aria-invalid={errors.comment ? 'true' : 'false'}
          aria-describedby={errors.comment ? 'review-comment-error' : undefined}
        />
        <FieldError id="review-comment-error" error={errors.comment} />
      </div>

      {decision === 'follow_up' ? (
        <div className={errors.followUpDate ? 'field invalid' : 'field'}>
          <label htmlFor="review-followUpDate">Follow-up date</label>
          <input
            id="review-followUpDate"
            type="date"
            value={followUpDate}
            onChange={(event) => {
              setFollowUpDate(event.target.value)
              setErrors(({ followUpDate: _cleared, ...rest }) => rest)
            }}
            aria-invalid={errors.followUpDate ? 'true' : 'false'}
            aria-describedby={errors.followUpDate ? 'review-followUpDate-error' : undefined}
          />
          <FieldError id="review-followUpDate-error" error={errors.followUpDate} />
        </div>
      ) : null}

      {formError ? (
        <p className="alert" role="alert" tabIndex={-1} ref={alertRef}>
          {formError}
        </p>
      ) : null}
      <button type="submit" className="submit" disabled={pending}>
        {pending ? 'Recording…' : 'Record decision'}
      </button>
    </form>
  )
}
