// Login screen -- full-bleed navy background with the animated sensor-trace
// signature behind everything, and a small centered, rounded sign-in card
// floating on top of it.
// Place this at src/components/Login.jsx (replaces the previous version).
// Needs its sibling Login.css in the same folder.

import { useAuth } from '../hooks/UseAuth.jsx'
import './Login.css'

export default function Login() {
  const { signInWithGoogle } = useAuth()

  return (
    <div className="login-screen">
      <div className="login-background" aria-hidden="true">
        <div className="login-panel__grid" />
        <div className="login-trace">
          <svg className="login-trace__svg" viewBox="0 0 800 160" preserveAspectRatio="none">
            <path
              d="M0,80 L20,80 L35,40 L50,120 L65,60 L80,90 L95,30 L110,100 L125,80
                 L145,80 L160,50 L175,110 L190,70 L205,95 L220,35 L235,105 L250,80
                 L270,80 L285,45 L300,115 L315,65 L330,90 L345,32 L360,100 L375,80
                 L800,80"
              fill="none"
            />
          </svg>
          <svg className="login-trace__svg" viewBox="0 0 800 160" preserveAspectRatio="none">
            <path
              d="M0,80 L20,80 L35,40 L50,120 L65,60 L80,90 L95,30 L110,100 L125,80
                 L145,80 L160,50 L175,110 L190,70 L205,95 L220,35 L235,105 L250,80
                 L270,80 L285,45 L300,115 L315,65 L330,90 L345,32 L360,100 L375,80
                 L800,80"
              fill="none"
            />
          </svg>
        </div>
      </div>

      <span className="login-wordmark">ICFAR</span>

      <div className="login-card">
        <span className="login-eyebrow">Sign in</span>
        <h1 className="login-heading">Welcome back</h1>
        <p className="login-subheading">
          Use your Google account to access your groups and readings.
        </p>

        <button className="login-google-btn" onClick={signInWithGoogle}>
          <svg className="login-google-icon" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4c-7.5 0-14 4.2-17.3 10.4z"/>
            <path fill="#4CAF50" d="M24 44c5.3 0 10.1-2 13.7-5.4l-6.3-5.3C29.4 35 26.8 36 24 36c-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.9 39.7 16.4 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.3 5.3C40.9 35.9 44 30.6 44 24c0-1.3-.1-2.7-.4-3.5z"/>
          </svg>
          Continue with Google
        </button>

        <p className="login-footer">Built for Jericho Lab · FAST Lab</p>
      </div>
    </div>
  )
}