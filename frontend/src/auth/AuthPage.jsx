import { useEffect } from 'react'
import { useLocation, useMatch } from 'react-router'
import AuthForm from './AuthForm.jsx'

const TITLES = {
  signin: 'Sign In',
  signup: 'Create Account',
}

// Rendered as a layout for /login and /register so the form (and the typed
// email) survives switching between the two.
export default function AuthPage() {
  const { state } = useLocation()
  // Matches like the router does (any case, optional trailing slash).
  const mode = useMatch('/register') ? 'signup' : 'signin'

  useEffect(() => {
    document.title = TITLES[mode]
  }, [mode])

  return (
    <main className="auth-main">
      <AuthForm mode={mode} notice={state?.registered ? 'Account created. Sign in to continue.' : null} />
    </main>
  )
}
