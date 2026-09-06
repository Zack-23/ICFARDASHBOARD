

import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from "../lib/SupabaseClient";

const API_URL = import.meta.env.VITE_API_URL

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    )

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = () => {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Preserves the current path (not just the origin) -- so a
        // logged-out visitor who lands on /invite/:token, then signs
        // in, gets returned to that same invite page afterward instead
        // of the OAuth round trip dropping them back at "/".
        redirectTo: window.location.href,
      },
    })
  }

  const signOut = () => {
    supabase.auth.signOut()
  }

  const apiFetch = (path, options = {}) => {
    const headers = {
      ...options.headers,
      Authorization: `Bearer ${session?.access_token}`,
    }
    return fetch(`${API_URL}${path}`, { ...options, headers })
  }

  const value = { session, loading, signInWithGoogle, signOut, apiFetch }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Every component calls this exactly like before -- the only change is
// that it now reads from the shared context instead of creating its own.
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>')
  }
  return context
}