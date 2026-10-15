import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { register } from '../api/auth.js'
import { ApiError } from '../api/client.js'
import { useAuth } from './AuthContext.jsx'
import { useStores } from './useStores.js'
import { focusFirstError, validateAuth } from './validate.js'

const EMPTY = {
  name: '',
  email: '',
  password: '',
  confirm: '',
  role: '',
  storeId: '',
  remember: false,
}

const COPY = {
  signin: {
    title: 'Welcome back',
    submit: 'Continue',
    pending: 'Signing in…',
  },
  signup: {
    title: 'Join now!',
    submit: 'Create',
    pending: 'Creating account…',
  },
}

const PATHS = {
  signin: '/login',
  signup: '/register',
}

// Maps a failed registration to field errors, or null when it is not field-specific.
function registrationErrors(error) {
  if (!(error instanceof ApiError)) return null
  if (error.status === 409) return { email: 'This email is already registered.' }
  if (error.status === 400 && error.body?.errors) {
    const known = Object.entries(error.body.errors).filter(([field]) => Object.hasOwn(EMPTY, field))
    return known.length > 0 ? Object.fromEntries(known) : null
  }
  return null
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

function PasswordField({ id, label, value, onChange, error, autoComplete, hint, warnCapsLock = false }) {
  const [visible, setVisible] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const showCapsLock = warnCapsLock && capsLock
  const describedBy = [
    error ? `${id}-error` : hint ? `${id}-hint` : null,
    showCapsLock ? `${id}-caps` : null,
  ].filter(Boolean)

  function trackCapsLock(event) {
    setCapsLock(event.getModifierState('CapsLock'))
  }

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
          aria-describedby={describedBy.length > 0 ? describedBy.join(' ') : undefined}
          onKeyDown={warnCapsLock ? trackCapsLock : undefined}
          onKeyUp={warnCapsLock ? trackCapsLock : undefined}
          onBlur={warnCapsLock ? () => setCapsLock(false) : undefined}
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
      {showCapsLock ? <p id={`${id}-caps`} className="hint caps">Caps Lock is on</p> : null}
    </div>
  )
}

function StoreField({ value, onChange, error, stores }) {
  const failed = stores.status === 'error'
  const empty = stores.status === 'ready' && stores.items.length === 0
  const hint = !error && (failed || empty)

  return (
    <div className={error ? 'field invalid' : 'field'}>
      <label htmlFor="storeId">Your store</label>
      <select
        id="storeId"
        name="storeId"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? 'storeId-error' : hint ? 'storeId-hint' : undefined}
        aria-busy={stores.status === 'loading'}
      >
        <option value="">{stores.status === 'loading' ? 'Loading stores…' : 'Select your store'}</option>
        {stores.items.map((store) => (
          <option key={store.id} value={store.id}>
            {store.address ? `${store.name} · ${store.address}` : store.name}
          </option>
        ))}
      </select>
      {hint ? (
        <p id="storeId-hint" className="hint">
          {failed ? (
            <>
              Couldn't load stores.{' '}
              <button type="button" className="text-button" onClick={stores.retry}>
                Try again
              </button>
            </>
          ) : (
            'No stores are registered yet.'
          )}
        </p>
      ) : null}
      {error ? <p id="storeId-error" className="error">{error}</p> : null}
    </div>
  )
}

export default function AuthForm({ mode, notice }) {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [serverErrors, setServerErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [pending, setPending] = useState(false)
  const [shownMode, setShownMode] = useState(mode)
  const stores = useStores(mode === 'signup' && values.role === 'owner')
  const copy = COPY[mode]
  const shown = { ...serverErrors, ...errors }

  // The mode follows the URL, so reset here rather than in the switch handler
  // to also cover back/forward navigation.
  if (mode !== shownMode) {
    setShownMode(mode)
    setSubmitted(false)
    setErrors({})
    setServerErrors({})
    setFormError(null)
    setValues((current) => ({ ...current, password: '', confirm: '' }))
  }

  function update(field, value) {
    const next = { ...values, [field]: value }
    setValues(next)
    if (submitted) setErrors(validateAuth(mode, next))
    if (serverErrors[field]) {
      setServerErrors(({ [field]: _cleared, ...rest }) => rest)
    }
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (pending) return

    const nextErrors = validateAuth(mode, values)
    setErrors(nextErrors)
    setServerErrors({})
    setFormError(null)
    setSubmitted(true)

    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors)
      return
    }

    setPending(true)
    try {
      if (mode === 'signup') {
        await register(values)
        setValues({ ...EMPTY, email: values.email.trim() })
        navigate(PATHS.signin, { state: { registered: true } })
      } else {
        // Storing the session lets GuestOnly send the user to their role's home page.
        await signIn({ email: values.email, password: values.password }, values.remember)
      }
    } catch (error) {
      const fieldErrors = mode === 'signup' ? registrationErrors(error) : null
      if (fieldErrors) {
        setServerErrors(fieldErrors)
        focusFirstError(fieldErrors)
      } else if (mode === 'signin' && error instanceof ApiError && error.status === 401) {
        // AC 13.2: keep the email, clear the password and put the cursor back in it.
        setFormError('credentials')
        setValues((current) => ({ ...current, password: '' }))
        document.getElementById('password')?.focus()
      } else {
        setFormError('unknown')
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="auth-panel">
      <div className="switch" role="group" aria-label="Account">
        <button type="button" aria-pressed={mode === 'signin'} onClick={() => navigate(PATHS.signin)}>
          Sign in
        </button>
        <button type="button" aria-pressed={mode === 'signup'} onClick={() => navigate(PATHS.signup)}>
          Create account
        </button>
      </div>

      {notice && !formError ? <p className="notice" role="status">{notice}</p> : null}

      <h1>{copy.title}</h1>

      <form onSubmit={onSubmit} noValidate>
        {mode === 'signup' ? (
          <TextField
            id="name"
            label="Full name"
            value={values.name}
            onChange={(value) => update('name', value)}
            error={shown.name}
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
          error={shown.email}
          autoComplete="email"
        />

        {mode === 'signup' ? (
          <fieldset
            className={shown.role ? 'roles invalid' : 'roles'}
            aria-describedby={shown.role ? 'role-error' : undefined}
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
                  aria-invalid={shown.role ? 'true' : 'false'}
                  aria-describedby={shown.role ? 'role-error' : undefined}
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
                  aria-invalid={shown.role ? 'true' : 'false'}
                  aria-describedby={shown.role ? 'role-error' : undefined}
                />
                <span className="role-title">Store owner</span>
                <span className="role-copy">See tickets and history for your store only.</span>
              </label>
            </div>
            {shown.role ? <p id="role-error" className="error role-error">{shown.role}</p> : null}
          </fieldset>
        ) : null}

        {mode === 'signup' && values.role === 'owner' ? (
          <div className="reveal">
            <StoreField
              value={values.storeId}
              onChange={(value) => update('storeId', value)}
              error={shown.storeId}
              stores={stores}
            />
          </div>
        ) : null}

        <PasswordField
          id="password"
          label="Password"
          value={values.password}
          onChange={(value) => update('password', value)}
          error={shown.password}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
          warnCapsLock={mode === 'signin'}
        />

        {mode === 'signup' ? (
          <PasswordField
            id="confirm"
            label="Confirm password"
            value={values.confirm}
            onChange={(value) => update('confirm', value)}
            error={shown.confirm}
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

        {formError ? (
          <div className="alert" role="alert">
            {formError === 'credentials' ? (
              <>
                <p>Invalid email or password.</p>
                <p>
                  Check your password and try again, or{' '}
                  <Link to={PATHS.signup}>create an account</Link> if you're new to AudEat.
                </p>
              </>
            ) : (
              <p>Something went wrong. Please try again.</p>
            )}
          </div>
        ) : null}

        <button type="submit" className="submit" disabled={pending} aria-busy={pending}>
          {pending ? copy.pending : copy.submit}
        </button>
      </form>
    </div>
  )
}
