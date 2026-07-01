import { Fragment, useEffect, useState } from 'react'
import { getAppropriations, getPaymentRefs, createAppropriation, updateAppropriation, deleteAppropriation } from '../api/client'
import { eur } from '../api/format'
import { useYear } from '../contexts/YearContext'
import type { Appropriation, PaymentRef } from '../api/types'

export default function Appropriations() {
  const { year } = useYear()
  const [items, setItems] = useState<Appropriation[]>([])
  const [refs, setRefs] = useState<PaymentRef[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  function toggle(code: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code); else next.add(code)
      return next
    })
  }

  const [paymentRefId, setPaymentRefId] = useState('')
  const [caAmount, setCaAmount] = useState('')
  const [paAmount, setPaAmount] = useState('')
  const [creditOrigin, setCreditOrigin] = useState('C1')
  const [source, setSource] = useState('initial')
  const [effectiveDate, setEffectiveDate] = useState(String(year) + '-01-01')
  const [note, setNote] = useState('')

  function load() {
    setLoading(true)
    Promise.all([getAppropriations(year), getPaymentRefs(year)])
      .then(([apps, rs]) => {
        setItems(apps)
        setRefs(rs)
        if (rs.length > 0 && !paymentRefId) setPaymentRefId(String(rs[0].id))
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [year])

  function openForm() {
    setError(null); setEditingId(null)
    setCaAmount(''); setPaAmount(''); setCreditOrigin('C1'); setSource('initial')
    setEffectiveDate(String(year) + '-01-01'); setNote('')
    if (refs.length > 0) setPaymentRefId(String(refs[0].id))
    setShowForm(true)
  }

  function openEdit(a: Appropriation) {
    setError(null); setEditingId(a.id)
    setPaymentRefId(String(a.paymentRefId))
    setCaAmount(String(a.caAmountEur)); setPaAmount(String(a.paAmountEur))
    setCreditOrigin(a.creditOrigin); setSource(a.source)
    setEffectiveDate(a.effectiveDate); setNote(a.note ?? '')
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      const data = {
        paymentRefId: Number(paymentRefId),
        fiscalYear: year,
        caAmountEur: Number(caAmount),
        paAmountEur: Number(paAmount),
        creditOrigin, source, effectiveDate,
        note: note || undefined,
      }
      if (editingId != null) await updateAppropriation(editingId, data)
      else await createAppropriation(data)
      setShowForm(false); load()
    } catch (e) { setError(String(e)) }
    finally { setSaving(false) }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this appropriation?')) return
    try { await deleteAppropriation(id); load() }
    catch (e) { setError(String(e)) }
  }

  return (
    <>
      <div className="page-header">
        <h1>Appropriations — {year}</h1>
        <button onClick={openForm} disabled={refs.length === 0}>+ Add Appropriation</button>
      </div>
      <div className="page-content">
        {refs.length === 0 && !loading && (
          <p className="text-muted" style={{ marginBottom: 12 }}>No payment refs for {year} — add payment refs first.</p>
        )}
        {error && !showForm && <p style={{ color: 'var(--clr-danger)', marginBottom: 12 }}>{error}</p>}
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Payment Ref</th>
                  <th>Source</th>
                  <th>Origin</th>
                  <th className="num">CA (€)</th>
                  <th className="num">PA (€)</th>
                  <th>Effective</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="empty-state">Loading…</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={8} className="empty-state">No appropriations for {year}.</td></tr>
                ) : (() => {
                  const groups = new Map<string, Appropriation[]>()
                  for (const a of items) {
                    if (!groups.has(a.paymentRefCode)) groups.set(a.paymentRefCode, [])
                    groups.get(a.paymentRefCode)!.push(a)
                  }
                  return [...groups.entries()].map(([code, groupItems]) => {
                    const open = !collapsed.has(code)
                    const totalCa = groupItems.reduce((s, a) => s + a.caAmountEur, 0)
                    const totalPa = groupItems.reduce((s, a) => s + a.paAmountEur, 0)
                    return (
                      <Fragment key={code}>
                        <tr onClick={() => toggle(code)} style={{ cursor: 'pointer', background: 'var(--clr-bg-soft, #f8fafc)', userSelect: 'none' }}>
                          <td colSpan={3}>
                            <span style={{ marginRight: 6, fontSize: 10, color: 'var(--clr-muted)' }}>{open ? '▼' : '▶'}</span>
                            <span className="code-badge" style={{ fontFamily: 'monospace', fontSize: 11 }}>{code}</span>
                            <span className="text-muted text-sm" style={{ marginLeft: 8 }}>{groupItems.length} {groupItems.length === 1 ? 'entry' : 'entries'}</span>
                          </td>
                          <td className="num" style={{ fontWeight: 600 }}><span className="eur">{eur(totalCa)}</span></td>
                          <td className="num" style={{ fontWeight: 600 }}><span className="eur">{eur(totalPa)}</span></td>
                          <td colSpan={3}></td>
                        </tr>
                        {open && groupItems.map(a => (
                          <tr key={a.id}>
                            <td></td>
                            <td className="text-sm text-muted">{a.source}</td>
                            <td><span className="code-badge">{a.creditOrigin}</span></td>
                            <td className="num"><span className="eur">{eur(a.caAmountEur)}</span></td>
                            <td className="num"><span className="eur">{eur(a.paAmountEur)}</span></td>
                            <td className="text-sm text-muted">{a.effectiveDate}</td>
                            <td className="text-sm text-muted">{a.note ?? '—'}</td>
                            <td style={{ display: 'flex', gap: 6 }}>
                              <button className="secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => openEdit(a)}>Edit</button>
                              <button className="danger" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => handleDelete(a.id)}>Delete</button>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editingId != null ? 'Edit' : 'Add'} Appropriation — {year}</h3>
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
                <div>
                  <label>CA Amount (€)</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00" value={caAmount} onChange={e => setCaAmount(e.target.value)} required />
                </div>
                <div>
                  <label>PA Amount (€)</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00" value={paAmount} onChange={e => setPaAmount(e.target.value)} required />
                </div>
              </div>
              <div className="form-row cols-3">
                <div>
                  <label>Credit Origin</label>
                  <select value={creditOrigin} onChange={e => setCreditOrigin(e.target.value)}>
                    <option value="C1">C1 — Current year</option>
                    <option value="C8">C8 — Carry-over</option>
                    <option value="C4">C4 — Assigned revenue</option>
                    <option value="C5">C5 — Assigned revenue (carry)</option>
                  </select>
                </div>
                <div>
                  <label>Source</label>
                  <select value={source} onChange={e => setSource(e.target.value)}>
                    <option value="initial">Initial</option>
                    <option value="amendment">Amendment</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </div>
                <div>
                  <label>Effective Date</label>
                  <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} required />
                </div>
              </div>
              <div className="form-row">
                <div>
                  <label>Note (optional)</label>
                  <input placeholder="e.g. Initial budget" value={note} onChange={e => setNote(e.target.value)} />
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
