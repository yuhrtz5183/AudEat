import { useState } from 'react'
import { ApiError } from '../api/client.js'
import { deleteIssuePhoto, submitInspection, updateResult, uploadIssuePhoto } from '../api/inspector.js'
import Photo from '../components/Photo.jsx'

function lineError(errors, id) {
  return errors[`results.${id}`] ?? null
}

/** Marks each requirement, adds comments and photos to flagged issues, then submits the draft (US 1, US 2). */
export default function ChecklistEditor({ inspection, onSubmitted }) {
  const [lines, setLines] = useState(inspection.results)
  const [errors, setErrors] = useState({})
  const [photoErrors, setPhotoErrors] = useState({})
  const [uploadingId, setUploadingId] = useState(null)
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

  async function onUploadPhoto(line, event) {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    setPhotoErrors((current) => ({ ...current, [line.id]: null }))
    setUploadingId(line.id)
    try {
      const res = await uploadIssuePhoto(line.id, file)
      setLines((current) =>
        current.map((item) =>
          item.id === line.id
            ? { ...item, photoIds: [...(item.photoIds ?? []), res.id] }
            : item,
        ),
      )
    } catch (error) {
      const msg =
        error instanceof ApiError && error.body?.errors?.file
          ? error.body.errors.file
          : error instanceof ApiError && error.body?.message
            ? error.body.message
            : "Couldn't upload photo. Please try again."
      setPhotoErrors((current) => ({ ...current, [line.id]: msg }))
    } finally {
      setUploadingId(null)
    }
  }

  async function onDeletePhoto(line, photoId) {
    setPhotoErrors((current) => ({ ...current, [line.id]: null }))
    try {
      await deleteIssuePhoto(line.id, photoId)
      setLines((current) =>
        current.map((item) =>
          item.id === line.id
            ? { ...item, photoIds: item.photoIds.filter((id) => id !== photoId) }
            : item,
        ),
      )
    } catch (error) {
      const msg =
        error instanceof ApiError && error.body?.message
          ? error.body.message
          : "Couldn't delete photo. Please try again."
      setPhotoErrors((current) => ({ ...current, [line.id]: msg }))
    }
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
                {line.compliant === false ? (
                  <>
                    {line.photoIds && line.photoIds.length > 0 ? (
                      <div className="field">
                        <span className="field-label">Evidence photos</span>
                        <ul className="photo-list" aria-label="Evidence photos">
                          {line.photoIds.map((id) => (
                            <li key={id}>
                              <Photo id={id} alt="Issue photo" onDelete={() => onDeletePhoto(line, id)} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="field photo-upload">
                      <label htmlFor={`photo-${line.id}`}>
                        {(line.photoIds?.length ?? 0) > 0 ? 'Add another photo' : 'Add a photo'}
                      </label>
                      <input
                        id={`photo-${line.id}`}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uploadingId === line.id || (line.photoIds?.length ?? 0) >= 5}
                        onChange={(event) => onUploadPhoto(line, event)}
                      />
                      {uploadingId === line.id ? <p className="lede">Uploading photo…</p> : null}
                      {photoErrors[line.id] ? <p className="error">{photoErrors[line.id]}</p> : null}
                      {(line.photoIds?.length ?? 0) >= 5 ? <p className="lede">Maximum 5 photos reached.</p> : null}
                    </div>
                  </>
                ) : null}
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
