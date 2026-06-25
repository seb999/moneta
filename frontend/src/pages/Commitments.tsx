import { useEffect, useState } from 'react'
import { getCommitments, getPaymentRefs, createCommitment, updateCommitment, updateCommitmentStatus } from '../api/client'
import { eur } from '../api/format'
import { useYear } from '../contexts/YearContext'
import type { Commitment, PaymentRef } from '../api/types'

const STATUS_TRANSITIONS: Record<string, string[]> = {
  active: ['closed', 'cancelled'],
  closed: ['active'],
  cancelled: [],
}

export default function Commitments() {
  const { year } = useYear()
  const [items, setItems] = useState<Commitment[]>([])
  const [refs, setRefs] = useState<PaymentRef[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [paymentRefId, setPaymentRefId] = useState('')
  const [reference, setReference] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [status, setStatus] = useState('active')
  const [contractType, setContractType] = useState('TM')

  function load() {
    setLoading(true)
    Promise.all([getCommitments(year), getPaymentRefs(year)])
      .then(([comms, rs]) => { setItems(comms); setRefs(rs); if (rs.length > 0) setPaymentRefId(String(rs[0].id)) })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [year])

  function openForm() {
    setError(null); setEditingId(null); setReference(''); setAmount('')
    setDate(new Date().toISOString().slice(0, 10)); setCounterparty(''); setStatus('active'); setContractType('TM')
    if (refs.length > 0) setPaymentRefId(String(refs[0].id))
    setShowForm(true)
  }

  function openEdit(c: Commitment) {
    setError(null); setEditingId(c.id)
    setPaymentRefId(String(c.paymentRefId)); setReference(c.reference); setAmount(String(c.amountEur))
    setDate(c.date); setCounterparty(c.counterparty ?? ''); setStatus(c.status); setContractType(c.contractType)
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null)
    try {
      const data = {
        paymentRefId: Number(paymentRefId), fiscalYear: year,
        reference, amountEur: Number(amount), date,
        counterparty: counterparty || undefined, status, contractType,
      }
      if (editingId != null) await updateCommitment(editingId, data)
      else await createCommitment(data)
      setShowForm(false); load()
    } catch (e) { setError(String(e)) }
    finally { setSaving(false) }
  }

  async function handleStatusChange(id: number, newStatus: string) {
    try { await updateCommitmentStatus(id, newStatus); load() }
    catch (e) { setError(String(e)) }
  }

  const total = items.filter(c => c.status !== 'cancelled').reduce((s, c) => s + c.amountEur, 0)

  return (
    <>
      <div className="page-header">
        <h1>Commitments — {year}</h1>
        <button onClick={openForm} disabled={refs.length === 0}>+ Add Commitment</button>
      </div>
      <div className="page-content">
        {refs.length === 0 && !loading && (
          <p className="text-muted" style={{ marginBottom: 12 }}>No payment refs for {year} — add payment refs first.</p>
        )}
        {error && !showForm && <p style={{ color: 'var(--clr-danger)', marginBottom: 12 }}>{error}</p>}
        <div className="card">
          <div className="card-header">
            <h2>Commitments</h2>
            {items.length > 0 && <span className="text-muted text-sm">Total active/closed: <strong>{eur(total)}</strong></span>}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Payment Ref</th>
                  <th>Type</th>
                  <th>Counterparty</th>
                  <th>Date</th>
                  <th className="num">Amount (€)</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="empty-state">Loading…</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={8} className="empty-state">No commitments for {year}.</td></tr>
                ) : items.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.reference}</td>
                    <td><span className="code-badge" style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.paymentRefCode}</span></td>
                    <td><span className="code-badge">{c.contractType}</span></td>
                    <td className="text-muted">{c.counterparty ?? '—'}</td>
                    <td className="text-sm text-muted">{c.date}</td>
                    <td className="num"><span className="eur">{eur(c.amountEur)}</span></td>
                    <td><span className={`status-badge ${c.status}`}>{c.status}</span></td>
                    <td>
                      <div className="flex-gap">
                        <button className="secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => openEdit(c)}>Edit</button>
                        {STATUS_TRANSITIONS[c.status]?.map(next => (
                          <button key={next} className={next === 'cancelled' ? 'danger' : 'secondary'}
                            style={{ fontSize: 11, padding: '3px 8px' }}
                            onClick={() => handleStatusChange(c.id, next)}>{next}</button>
                        ))}
                      </div>
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
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editingId != null ? 'Edit' : 'Add'} Commitment — {year}</h3>
            {error && <p style={{ color: 'var(--clr-danger)', marginBottom: 12, fontSize: 13 }}>{error}</p>}
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div>
                  <label>Payment Ref</label>
                  <select value={paymentRefId} onChange={e => setPaymentRefId(e.target.value)} required>
                    {refs.map(r => <option key={r.id} value={r.id}>{r.paymentRefId} — {r.description}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row cols-2">
                <div><label>Reference</label><input placeholder="e.g. PO-2026-001" value={reference} onChange={e => setReference(e.target.value)} required /></div>
                <div><label>Counterparty</label><input placeholder="e.g. Altia" value={counterparty} onChange={e => setCounterparty(e.target.value)} /></div>
              </div>
              <div className="form-row cols-3">
                <div><label>Amount (€)</label><input type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required /></div>
                <div><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
                <div>
                  <label>Contract Type</label>
                  <select value={contractType} onChange={e => setContractType(e.target.value)}>
                    <option value="TM">TM — Time &amp; Means</option>
                    <option value="FP">FP — Fixed Price</option>
                    <option value="QTM">QTM — Quoted Time &amp; Materials</option>
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" disabled={saving}>{saving ? 'Saving…' : editingId != null ? 'Save' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
