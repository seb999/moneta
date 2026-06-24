import { useEffect, useState } from 'react'
import { getTaskmanKey, setTaskmanKey, hasBeenAsked, subscribeTaskmanKey } from '../api/taskmanKey'

export default function TaskmanKeySettings() {
  const [key, setKey] = useState(getTaskmanKey())
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => subscribeTaskmanKey(setKey), [])

  // Prompt once at startup if no key has ever been set/dismissed
  useEffect(() => {
    if (!getTaskmanKey() && !hasBeenAsked()) { setDraft(''); setOpen(true) }
  }, [])

  function openModal() { setDraft(getTaskmanKey()); setOpen(true) }
  function save() { setTaskmanKey(draft); setOpen(false) }
  function useDefault() { setTaskmanKey(''); setOpen(false) }

  return (
    <>
      <button
        className="secondary"
        onClick={openModal}
        title={key ? 'Your Taskman key is set' : 'Using the default Taskman key'}
        style={{ width: '100%', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 999, background: key ? 'var(--clr-green)' : 'var(--clr-muted)' }} />
        Taskman Key
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <h3>Taskman API Key</h3>
            <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
              Moneta uses your Taskman key for all Taskman operations (ingestion, discovery, and the assistant).
              Stored in this browser only. Leave blank to use the app's default key.
            </p>
            <div className="form-row">
              <div>
                <label>Your Taskman API key</label>
                <input
                  type="password"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  placeholder={key ? '•••••••• (saved)' : 'Paste your Redmine/Taskman API key'}
                  autoFocus
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="secondary" onClick={useDefault}>Use default key</button>
              <button type="button" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
