import { useEffect, useState, type ReactNode } from 'react'
import { validateTaskmanKey } from '../api/client'
import { getTaskmanKey, setTaskmanKey, subscribeTaskmanKey } from '../api/taskmanKey'

type Status = 'checking' | 'valid' | 'invalid' | 'error'

/**
 * Blocks the entire app until the Taskman key validates against Taskman.
 * Until then no page mounts, so nothing from the local DB is shown.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking')
  const [draft, setDraft] = useState('')
  const [rejected, setRejected] = useState(false)

  async function check() {
    setStatus('checking')
    try {
      const { valid } = await validateTaskmanKey()
      setStatus(valid ? 'valid' : 'invalid')
      if (!valid) setRejected(getTaskmanKey() !== '' )
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => { check() }, [])
  // Re-validate whenever the key changes (from here or the sidebar control)
  useEffect(() => subscribeTaskmanKey(() => check()), [])

  if (status === 'valid') return <>{children}</>

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--clr-bg, #f1f5f9)', padding: 20,
    }}>
      <div className="modal" style={{ maxWidth: 460, width: '100%' }}>
        <div className="sidebar-logo" style={{ marginBottom: 12 }}>
          Moneta
          <span>EEA Budget Management</span>
        </div>

        {status === 'checking' ? (
          <p className="text-muted">Checking Taskman access…</p>
        ) : status === 'error' ? (
          <>
            <h3>Can’t reach the server</h3>
            <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
              The backend didn’t respond. Check that the API is running, then retry.
            </p>
            <div className="form-actions">
              <button type="button" onClick={check}>Retry</button>
            </div>
          </>
        ) : (
          <>
            <h3>Enter your Taskman API key</h3>
            <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
              Moneta needs a valid Taskman (Redmine) key before it can show any data.
              {rejected && <span style={{ color: 'var(--clr-danger)' }}> The key was rejected by Taskman — check it and try again.</span>}
            </p>
            <div className="form-row"><div>
              <label>Taskman API key</label>
              <input
                type="password"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Paste your Redmine/Taskman API key"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) setTaskmanKey(draft) }}
              />
            </div></div>
            <div className="form-actions">
              <button type="button" disabled={!draft.trim()} onClick={() => setTaskmanKey(draft)}>Continue</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
