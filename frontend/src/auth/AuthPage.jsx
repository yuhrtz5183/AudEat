import { useEffect, useState } from 'react'
import AuthForm from './AuthForm.jsx'

const TITLES = {
  signin: 'Sign In',
  signup: 'Create Account',
}

export default function AuthPage() {
  const [mode, setMode] = useState('signin')

  useEffect(() => {
    document.title = TITLES[mode]
  }, [mode])

  return (
    <main className="auth-main">
      <AuthForm mode={mode} onMode={setMode} />
    </main>
  )
}
