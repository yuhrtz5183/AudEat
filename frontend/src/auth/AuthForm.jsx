import { useState } from 'react'
import { focusFirstError, validateAuth } from './validate.js'

const EMPTY = {
  name: '',
  email: '',
  password: '',
  confirm: '',
  role: '',
  storeName: '',
  remember: false,
}

const COPY = {
  signin: {
    submit: 'Continue',
  },
  signup: {
    title: 'Join now!',
    submit: 'Create',
  },
}

function Eye({ off = false }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off ? <path d="M4 4l16 16" /> : null}
    </svg>
  )
}

function TextField({ id, label, type = 'text', value, onChange, error, autoComplete, hint, inputMode }) {
  return (
    <div className={error ? 'field invalid' : 'field'}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        spellCheck={type === 'email' ? false : undefined}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
      {hint && !error ? <p id={`${id}-hint`} className="hint">{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="error">{error}</p> : null}
    </div>
  )
}

function PasswordField({ id, label, value, onChange, error, autoComplete, hint }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className={error ? 'field invalid' : 'field'}>
      <label htmlFor={id}>{label}</label>
      <div className="password">
        <input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          className="ghost-icon"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          <Eye off={visible} />
        </button>
      </div>
      {hint && !error ? <p id={`${id}-hint`} className="hint">{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="error">{error}</p> : null}
    </div>
  )
}

export default function AuthForm({ mode, onMode }) {
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const copy = COPY[mode]

  function changeMode(next) {
    setSubmitted(false)
    setErrors({})
    setValues((current) => ({ ...current, password: '', confirm: '' }))
    onMode(next)
  }

  function update(field, value) {
    const next = { ...values, [field]: value }
    setValues(next)
    if (submitted) setErrors(validateAuth(mode, next))
  }

  function onSubmit(event) {
    event.preventDefault()
    const nextErrors = validateAuth(mode, values)
    setErrors(nextErrors)
    setSubmitted(true)

    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors)
    }
  }

  return (
    <div className="auth-panel">
      <div className="switch" role="group" aria-label="Account">
        <button type="button" aria-pressed={mode === 'signin'} onClick={() => changeMode('signin')}>
          Sign in
        </button>
        <button type="button" aria-pressed={mode === 'signup'} onClick={() => changeMode('signup')}>
          Create account
        </button>
      </div>

      <h1>{copy.title}</h1>

      <form onSubmit={onSubmit} noValidate>
        {mode === 'signup' ? (
          <TextField
            id="name"
            label="Full name"
            value={values.name}
            onChange={(value) => update('name', value)}
            error={errors.name}
            autoComplete="name"
          />
        ) : null}

        <TextField
          id="email"
          label="Email"
          type="email"
          inputMode="email"
          value={values.email}
          onChange={(value) => update('email', value)}
          error={errors.email}
          autoComplete="email"
        />

        {mode === 'signup' ? (
          <fieldset
            className={errors.role ? 'roles invalid' : 'roles'}
            aria-describedby={errors.role ? 'role-error' : undefined}
          >
            <legend>Account type</legend>
            <div className="role-grid">
              <label className="role">
                <input
                  id="role-inspector"
                  type="radio"
                  name="role"
                  value="inspector"
                  checked={values.role === 'inspector'}
                  onChange={() => update('role', 'inspector')}
                  aria-invalid={errors.role ? 'true' : 'false'}
                  aria-describedby={errors.role ? 'role-error' : undefined}
                />
                <span className="role-title">Inspector</span>
                <span className="role-copy">Review any store and its full inspection history.</span>
              </label>
              <label className="role">
                <input
                  id="role-owner"
                  type="radio"
                  name="role"
                  value="owner"
                  checked={values.role === 'owner'}
                  onChange={() => update('role', 'owner')}
                  aria-invalid={errors.role ? 'true' : 'false'}
                  aria-describedby={errors.role ? 'role-error' : undefined}
                />
                <span className="role-title">Store owner</span>
                <span className="role-copy">See tickets and history for your store only.</span>
              </label>
            </div>
            {errors.role ? <p id="role-error" className="error role-error">{errors.role}</p> : null}
          </fieldset>
        ) : null}

        {mode === 'signup' && values.role === 'owner' ? (
          <div className="reveal">
            <TextField
              id="storeName"
              label="Store name"
              value={values.storeName}
              onChange={(value) => update('storeName', value)}
              error={errors.storeName}
              autoComplete="organization"
            />
          </div>
        ) : null}

        <PasswordField
          id="password"
          label="Password"
          value={values.password}
          onChange={(value) => update('password', value)}
          error={errors.password}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
        />

        {mode === 'signup' ? (
          <PasswordField
            id="confirm"
            label="Confirm password"
            value={values.confirm}
            onChange={(value) => update('confirm', value)}
            error={errors.confirm}
            autoComplete="new-password"
          />
        ) : null}

        {mode === 'signin' ? (
          <div className="assist">
            <label className="check">
              <input
                type="checkbox"
                checked={values.remember}
                onChange={(event) => update('remember', event.target.checked)}
              />
              <span>Keep me signed in</span>
            </label>
          </div>
        ) : null}

        <button type="submit" className="submit">
          {copy.submit}
        </button>
      </form>
    </div>
  )
}
