import { useEffect, useState } from 'react'
import { getPaymentRefs, createPaymentRef, updatePaymentRef, deletePaymentRef, ingestMonth } from '../api/client'
import { useYear } from '../contexts/YearContext'
import type { IngestSummary, PaymentRef } from '../api/types'

function defaultPeriod() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

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

  // Ingestion bar
  const [period, setPeriod] = useState(defaultPeriod)
  const [ingesting, setIngesting] = useState(false)
  const [ingestResult, setIngestResult] = useState<IngestSummary | null>(null)
  const [ingestError, setIngestError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    getPaymentRefs(year).then(setRefs).catch(e => setError(String(e))).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [year])

  async function handleIngest() {
    setIngesting(true); setIngestResult(null); setIngestError(null)
    try {
      const result = await ingestMonth(year, period)
      setIngestResult(result)
    } catch (e) {
      setIngestError(String(e))
    } finally {
      setIngesting(false)
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

  async function handleSave(e: React.FormEvent) {
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

  return (
    <>
      <div className="page-header">
        <h1>Payment Refs — {year}</h1>
        <button onClick={() => openForm()}>+ Add</button>
      </div>
      <div className="page-content">
        {error && !showForm && <p style={{ color: 'var(--clr-danger)', marginBottom: 12 }}>{error}</p>}

        {/* Ingestion bar */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body" style={{ padding: '14px 18px' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Ingest from Taskman</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ margin: 0, fontSize: 13, fontWeight: 400 }}>Period</label>
                <input
                  style={{ width: 110 }}
                  placeholder="YYYY-MM"
                  value={period}
                  onChange={e => { setPeriod(e.target.value); setIngestResult(null) }}
                  pattern="\d{4}-\d{2}"
                />
              </div>
              <button onClick={handleIngest} disabled={ingesting || !period || refs.length === 0}>
                {ingesting ? 'Ingesting…' : 'Fetch from Taskman'}
              </button>
              {ingestError && <span style={{ color: 'var(--clr-danger)', fontSize: 12 }}>{ingestError}</span>}
              {ingestResult && (
                <span style={{ fontSize: 12, color: 'var(--clr-muted)' }}>
                  {ingestResult.entriesProcessed} entries —{' '}
                  <span style={{ color: '#16a34a', fontWeight: 600 }}>{ingestResult.mapped} mapped</span>
                  {ingestResult.unmapped > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}> · {ingestResult.unmapped} unmapped</span>}
                  {ingestResult.excluded > 0 && <span style={{ color: '#94a3b8' }}> · {ingestResult.excluded} excluded</span>}
                  {' · '}
                  <strong>€ {ingestResult.totalComputedEur.toLocaleString('en-EU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </span>
              )}
            </div>
            {ingestResult && ingestResult.warnings.length > 0 && (
              <ul style={{ marginTop: 8, paddingLeft: 20, fontSize: 12, color: 'var(--clr-muted)' }}>
                {ingestResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        </div>

        {/* Payment refs table */}
        <div className="card">
          <div className="card-header">
            <h2>Payment Refs <span className="text-muted text-sm" style={{ fontWeight: 400 }}>({refs.filter(r => !filter || r.paymentRefId.toLowerCase().includes(filter.toLowerCase()) || r.description.toLowerCase().includes(filter.toLowerCase())).length})</span></h2>
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
                ) : refs.length === 0 ? (
                  <tr><td colSpan={3} className="empty-state">No payment refs for {year}. Add one to get started.</td></tr>
                ) : refs.filter(r => !filter || r.paymentRefId.toLowerCase().includes(filter.toLowerCase()) || r.description.toLowerCase().includes(filter.toLowerCase())).map(r => (
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
