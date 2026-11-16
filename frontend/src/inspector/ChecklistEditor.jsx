import { useState } from 'react'
import { ApiError } from '../api/client.js'
import { submitInspection, updateResult } from '../api/inspector.js'

function lineError(errors, id) {
  return errors[`results.${id}`] ?? null
}

/** Marks each requirement, then submits the draft (US 1). Photos are User Story 2. */
export default function ChecklistEditor({ inspection, onSubmitted }) {
  const [lines, setLines] = useState(inspection.results)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [pending, setPending] = useState(false)

  function replace(saved) {
    setLines((current) => current.map((line) => (line.id === saved.id ? { ...line, ...saved } : line)))
    setErrors((current) => {
      const next = { ...current }
      delete next[`results.${saved.id}`]
      return next
    })
  }

  async function persist(line, compliant, comment) {
    const saved = await updateResult(line.id, {
      compliant,
      comment: comment?.trim() ? comment.trim() : null,
    })
    replace(saved)
    return saved
  }

  async function choose(line, compliant) {
    setLines((current) => current.map((item) => (item.id === line.id ? { ...item, compliant } : item)))
    setFormError(null)
    try {
      await persist(line, compliant, line.comment)
    } catch (error) {
      setFormError(error instanceof ApiError && error.body?.message ? error.body.message : "Couldn't save that line. Please try again.")
    }
  }

  function editComment(line, comment) {
    setLines((current) => current.map((item) => (item.id === line.id ? { ...item, comment } : item)))
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (pending) return
    const unmarked = lines.filter((line) => line.compliant !== true && line.compliant !== false)
    if (unmarked.length > 0) {
      setErrors(Object.fromEntries(unmarked.map((line) => [`results.${line.id}`, 'Mark this requirement.'])))
      const first = document.getElementById(`mark-${unmarked[0].id}-compliant`)
      first?.focus()
      return
    }
    setPending(true)
    setFormError(null)
    try {
      for (const line of lines) {
        await persist(line, line.compliant, line.comment)
      }
      onSubmitted(await submitInspection(inspection.id))
    } catch (error) {
      const fields = error instanceof ApiError && error.status === 400 ? error.body?.errors : null
      if (fields?.comment) setFormError(fields.comment)
      else if (fields) setErrors(fields)
      else setFormError(error instanceof ApiError && error.body?.message ? error.body.message : "Couldn't submit the inspection. Please try again.")
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p className="lede">Mark every requirement, then submit the inspection.</p>
      <ul className="ticket-list" aria-label="Checklist">
        {lines.map((line) => {
          const message = lineError(errors, line.id)
          return (
            <li key={line.id} className="ticket-card">
              <fieldset>
                <legend className="ticket-issue">{line.requirement}</legend>
                <div className="mark-choices">
                  <label>
                    <input
                      id={`mark-${line.id}-compliant`}
                      type="radio"
                      name={`mark-${line.id}`}
                      checked={line.compliant === true}
                      onChange={() => choose(line, true)}
                    />
                    Compliant
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`mark-${line.id}`}
                      checked={line.compliant === false}
                      onChange={() => choose(line, false)}
                    />
                    Flagged
                  </label>
                </div>
                <div className={errors.comment ? 'field invalid' : 'field'}>
                  <label htmlFor={`comment-${line.id}`}>Comment</label>
                  <textarea
                    id={`comment-${line.id}`}
                    value={line.comment ?? ''}
                    onChange={(event) => editComment(line, event.target.value)}
                  />
                </div>
                {message ? <p className="error">{message}</p> : null}
              </fieldset>
            </li>
          )
        })}
      </ul>
      {formError ? <p className="alert" role="alert">{formError}</p> : null}
      <button type="submit" className="submit" disabled={pending}>
        {pending ? 'Submitting…' : 'Submit inspection'}
      </button>
    </form>
  )
}
