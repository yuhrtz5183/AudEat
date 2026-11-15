import { useState } from 'react'
import { ApiError } from '../api/client.js'
import { createTicket } from '../api/inspector.js'

function validate({ requiredRemediation, deadline }) {
  const errors = {}
  const text = requiredRemediation.trim()
  if (!text) errors.requiredRemediation = 'Describe the required remediation.'
  else if (text.length > 1000) errors.requiredRemediation = 'Use 1000 characters or fewer.'
  if (!deadline) errors.deadline = 'A deadline is required.'
  return errors
}

function FieldError({ id, error }) {
  return error ? (
    <p id={id} className="error">{error}</p>
  ) : null
}

/** Creates the remediation ticket for one flagged issue (US 3). */
export default function CreateTicketForm({ resultId, onCreated }) {
  const [requiredRemediation, setRequiredRemediation] = useState('')
  const [deadline, setDeadline] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    if (pending) return
    const nextErrors = validate({ requiredRemediation, deadline })
    setErrors(nextErrors)
    setFormError(null)
    if (Object.keys(nextErrors).length > 0) {
      const field = ['requiredRemediation', 'deadline'].find((name) => nextErrors[name])
      document.getElementById(`ticket-${resultId}-${field}`)?.focus()
      return
    }
    setPending(true)
    try {
      await createTicket(resultId, { requiredRemediation: requiredRemediation.trim(), deadline })
      onCreated()
    } catch (error) {
      const fields = error instanceof ApiError && error.status === 400 ? error.body?.errors : null
      if (fields) setErrors(fields)
      else if (error instanceof ApiError && error.body?.message) setFormError(error.body.message)
      else setFormError("Couldn't create the ticket. Please try again.")
      setPending(false)
    }
  }

  return (
    <div className="evidence-form">
    <form onSubmit={onSubmit} noValidate>
      <div className={errors.requiredRemediation ? 'field invalid' : 'field'}>
        <label htmlFor={`ticket-${resultId}-requiredRemediation`}>Required remediation</label>
        <textarea
          id={`ticket-${resultId}-requiredRemediation`}
          value={requiredRemediation}
          onChange={(event) => {
            setRequiredRemediation(event.target.value)
            setErrors(({ requiredRemediation: _cleared, ...rest }) => rest)
          }}
          aria-invalid={errors.requiredRemediation ? 'true' : 'false'}
          aria-describedby={
            errors.requiredRemediation ? `ticket-${resultId}-requiredRemediation-error` : undefined
          }
        />
        <FieldError
          id={`ticket-${resultId}-requiredRemediation-error`}
          error={errors.requiredRemediation}
        />
      </div>
      <div className={errors.deadline ? 'field invalid' : 'field'}>
        <label htmlFor={`ticket-${resultId}-deadline`}>Deadline</label>
        <input
          id={`ticket-${resultId}-deadline`}
          type="date"
          value={deadline}
          onChange={(event) => {
            setDeadline(event.target.value)
            setErrors(({ deadline: _cleared, ...rest }) => rest)
          }}
          aria-invalid={errors.deadline ? 'true' : 'false'}
          aria-describedby={errors.deadline ? `ticket-${resultId}-deadline-error` : undefined}
        />
        <FieldError id={`ticket-${resultId}-deadline-error`} error={errors.deadline} />
      </div>
      {formError ? (
        <p className="alert" role="alert">{formError}</p>
      ) : null}
      <button type="submit" className="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create ticket'}
      </button>
    </form>
    </div>
  )
}
