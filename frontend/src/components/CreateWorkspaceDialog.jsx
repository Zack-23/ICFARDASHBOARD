

import { useState } from 'react'
import { useWorkspace } from '../hooks/UseWorkspace.jsx'
import { useToast } from './ui/Toast.jsx'
import Modal from './ui/Modal.jsx'
import './ui/Modal.css'

export default function CreateWorkspaceDialog({ open, onClose }) {
  const { createWorkspace } = useWorkspace()
  const showToast = useToast()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const reset = () => {
    setName('')
    setDescription('')
    setError(null)
    setCreating(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (name.trim() === '' || creating) return
    setCreating(true)
    setError(null)
    try {
      const ws = await createWorkspace(name.trim(), description.trim())
      showToast(`"${ws.name}" created`, { tone: 'success' })
      reset()
      onClose()
    } catch (err) {
      setError(err.message)
      setCreating(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create workspace"
      description="Workspaces organize your sensor datasets and make it easy to collaborate with other researchers."
      width={420}
    >
      <form onSubmit={handleCreate}>
        <div className="modal__field">
          <label className="modal__label" htmlFor="new-workspace-name">Workspace name</label>
          <input
            id="new-workspace-name"
            className="modal__input"
            type="text"
            placeholder="e.g. FAST Lab Research"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={80}
          />
        </div>
        <div className="modal__field">
          <label className="modal__label" htmlFor="new-workspace-description">Description (optional)</label>
          <textarea
            id="new-workspace-description"
            className="modal__textarea"
            placeholder="What is this workspace for?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
          />
        </div>

        {error && <p className="modal__error">{error}</p>}

        <div className="modal__footer">
          <button type="button" className="modal__btn modal__btn--secondary" onClick={handleClose}>
            Cancel
          </button>
          <button type="submit" className="modal__btn modal__btn--primary" disabled={name.trim() === '' || creating}>
            {creating ? 'Creating...' : 'Create workspace'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
