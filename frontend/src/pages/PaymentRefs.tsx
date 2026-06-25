import { useEffect, useState } from 'react'
import { getPaymentRefs, createPaymentRef, updatePaymentRef, deletePaymentRef, syncPaymentRefsFromTaskman, getSyncedProjects, syncRedmineProjects } from '../api/client'
import { useYear } from '../contexts/YearContext'
import type { PaymentRef } from '../api/types'

export default function PaymentRefs() {
  const { year } = useYear()
  const [refs, setRefs] = useState<PaymentRef[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<PaymentRef | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [paymentRefId, setPaymentRefId] = useState('')
  const [description, setDescription] = useState('')
  const [filter, setFilter] = useState('')

  const [projects, setProjects] = useState<{ projectId: number; name: string }[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [syncingProjects, setSyncingProjects] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ foundInTaskman: number; created: number; createdRefs: string[] } | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    getPaymentRefs(year).then(setRefs).catch(e => setError(String(e))).finally(() => setLoading(false))
  }

  function loadProjects() {
    getSyncedProjects()
      .then(p => { setProjects(p); if (p.length) setSelectedProject(String(p[0].projectId)) })
      .catch(() => {})
  }

  useEffect(() => { load() }, [year])
  useEffect(() => { loadProjects() }, [])

  async function handleSyncProjects() {
    setSyncingProjects(true); setSyncError(null)
    try {
      await syncRedmineProjects()
      loadProjects()
    } catch (e) {
      setSyncError(String(e))
    } finally {
      setSyncingProjects(false)
    }
  }

  async function handleSync() {
    if (!selectedProject) return
    setSyncing(true); setSyncResult(null); setSyncError(null)
    try {
      const result = await syncPaymentRefsFromTaskman(year, Number(selectedProject))
      setSyncResult(result)
      load()
    } catch (e) {
      setSyncError(String(e))
    } finally {
      setSyncing(false)
    }
  }

  function openForm(item?: PaymentRef) {
    setError(null); setEditItem(item ?? null)
    setPaymentRefId(item?.paymentRefId ?? '')
    setDescription(item?.description ?? '')
    setShowForm(true)
  }

  async function handleDelete() {
    if (!editItem) return
    if (!confirm(`Delete "${editItem.paymentRefId}"? This cannot be undone.`)) return
    setSaving(true); setError(null)
    try {
      await deletePaymentRef(editItem.id)
      setShowForm(false); load()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true); setError(null)
    const data = { fiscalYear: year, paymentRefId, description }
    try {
      if (editItem) await updatePaymentRef(editItem.id, data)
      else await createPaymentRef(data)
      setShowForm(false); load()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const filtered = refs.filter(r =>
    !filter ||
    r.paymentRefId.toLowerCase().includes(filter.toLowerCase()) ||
    r.description.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <>
      <div className="page-header">
        <h1>Payment Refs — {year}</h1>
        <button onClick={() => openForm()}>+ Add</button>
      </div>
      <div className="page-content">
        {error && !showForm && <p style={{ color: 'var(--clr-danger)', marginBottom: 12 }}>{error}</p>}

        {/* Taskman sync bar */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body" style={{ padding: '14px 18px' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Fetch from Taskman</span>

              {projects.length === 0 ? (
                <>
                  <span className="text-muted text-sm">No projects synced yet.</span>
                  <button className="secondary" onClick={handleSyncProjects} disabled={syncingProjects}>
                    {syncingProjects ? 'Syncing…' : 'Sync projects from Taskman'}
                  </button>
                </>
              ) : (
                <>
                  <select
                    value={selectedProject}
                    onChange={e => { setSelectedProject(e.target.value); setSyncResult(null) }}
                    style={{ minWidth: 240 }}
                  >
                    {projects.map(p => (
                      <option key={p.projectId} value={p.projectId}>{p.name}</option>
                    ))}
                  </select>
                  <button onClick={handleSync} disabled={syncing || !selectedProject}>
                    {syncing ? 'Fetching…' : 'Fetch payment refs'}
                  </button>
                  <button
                    className="secondary"
                    style={{ fontSize: 11, padding: '3px 10px' }}
                    onClick={handleSyncProjects}
                    disabled={syncingProjects}
                    title="Re-sync project list from Taskman"
                  >
                    {syncingProjects ? '…' : '↻ Projects'}
                  </button>
                </>
              )}

              {syncError && <span style={{ color: 'var(--clr-danger)', fontSize: 12 }}>{syncError}</span>}
              {syncResult && (
                <span style={{ fontSize: 12, color: 'var(--clr-muted)' }}>
                  Found <strong>{syncResult.foundInTaskman}</strong> in Taskman
                  {syncResult.created > 0
                    ? <> — <span style={{ color: '#16a34a', fontWeight: 600 }}>+{syncResult.created} created</span></>
                    : <> — all already present</>}
                </span>
              )}
            </div>

            {syncResult && syncResult.createdRefs.length > 0 && (
              <ul style={{ marginTop: 8, paddingLeft: 20, fontSize: 12, color: 'var(--clr-muted)' }}>
                {syncResult.createdRefs.map(r => <li key={r}><code>{r}</code></li>)}
              </ul>
            )}
          </div>
        </div>

        {/* Payment refs table */}
        <div className="card">
          <div className="card-header">
            <h2>Payment Refs <span className="text-muted text-sm" style={{ fontWeight: 400 }}>({filtered.length})</span></h2>
            <input
              style={{ width: 240 }}
              placeholder="Filter by ref ID or description…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Payment Ref ID</th>
                  <th>Description</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={3} className="empty-state">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={3} className="empty-state">
                    {refs.length === 0
                      ? `No payment refs for ${year}. Pick a project above and click "Fetch payment refs", or add one manually.`
                      : 'No results match your filter.'}
                  </td></tr>
                ) : filtered.map(r => (
                  <tr key={r.id}>
                    <td><span className="code-badge" style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.paymentRefId}</span></td>
                    <td>{r.description}</td>
                    <td>
                      <button className="secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => openForm(r)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <h3>{editItem ? 'Edit' : 'Add'} Payment Ref — {year}</h3>
            {error && <p style={{ color: 'var(--clr-danger)', marginBottom: 12, fontSize: 13 }}>{error}</p>}
            <form onSubmit={handleSave}>
              <div className="form-row">
                <div>
                  <label htmlFor="pr-id">Payment Ref ID (from Taskman)</label>
                  <input
                    id="pr-id"
                    placeholder="e.g. es_bilbomatica-Natura2000-EEA/DTL/25/015/EEA.61006"
                    value={paymentRefId}
                    onChange={e => setPaymentRefId(e.target.value)}
                    required
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  />
                </div>
              </div>
              <div className="form-row">
                <div>
                  <label htmlFor="pr-desc">Description</label>
                  <input
                    id="pr-desc"
                    placeholder="e.g. Bilbomatica — Natura2000 contract 2025"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="form-actions">
                {editItem && (
                  <button type="button" className="danger" onClick={handleDelete} disabled={saving}>Delete</button>
                )}
                <button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" disabled={saving}>{saving ? 'Saving…' : editItem ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
