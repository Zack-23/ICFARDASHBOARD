// Top-level app: shows Login until a session exists, then Home -- which
// decides on its own whether to show the upload flow or the workspace.
// Place this at src/App.jsx (replaces the previous version).

import { useAuth } from './hooks/UseAuth.jsx'
import Login from './components/Login'
import Home from './Home'

export default function App() {
  const { session, loading } = useAuth()

  if (loading) {
    return <p>Loading...</p>
  }

  return session ? <Home /> : <Login />
}