import { createRoot } from 'react-dom/client'
import { AuthProvider } from "./hooks/UseAuth.jsx"
import { WorkspaceProvider } from "./hooks/UseWorkspace.jsx"
import { ToastProvider } from "./components/ui/Toast.jsx"
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <ToastProvider>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </ToastProvider>
  </AuthProvider>
)
