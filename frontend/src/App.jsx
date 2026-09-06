

import { useState, useEffect } from 'react'
import { useAuth } from './hooks/UseAuth.jsx'
import Login from './components/Login'
import Home from './Home'
import InviteAcceptancePage from './components/InviteAcceptancePage'

function currentPath() {
  return window.location.pathname
}

export default function App() {
  const { session, loading } = useAuth()
  const [path, setPath] = useState(currentPath)

  useEffect(() => {
    const onPopState = () => setPath(currentPath())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = (to) => {
    window.history.pushState({}, '', to)
    setPath(to)
  }

  const inviteMatch = path.match(/^\/invite\/([^/?#]+)/)

  if (inviteMatch) {
    return <InviteAcceptancePage token={inviteMatch[1]} onDone={() => navigate('/')} />
  }

  if (loading) {
    return <p>Loading...</p>
  }

  return session ? <Home /> : <Login />
}
