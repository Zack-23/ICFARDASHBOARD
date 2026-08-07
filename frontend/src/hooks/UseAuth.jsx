// Shared Supabase auth state for the whole app, provided via Context so
// every component that calls useAuth() gets the SAME session -- not a
// fresh, independently-loading copy of its own.
//
// This REPLACES the previous hooks/useAuth.js. Note the .jsx extension --
// it now returns JSX (<AuthContext.Provider>), so it can't stay a .js file.
// Delete the old hooks/useAuth.js and place this at hooks/UseAuth.jsx instead.

import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

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
    supabase.auth.signInWithOAuth({ provider: 'google' })
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