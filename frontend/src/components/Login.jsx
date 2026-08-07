// Simple login screen shown when there's no active session. Swap or extend
// with more providers later (email/password, magic link, etc.) without
// touching useAuth's shape.
// Place this at e.g. src/components/Login.jsx

import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { signInWithGoogle } = useAuth()

  return (
    <div>
      <h1>Sign in</h1>
      <button onClick={signInWithGoogle}>Sign in with Google</button>
    </div>
  )
}