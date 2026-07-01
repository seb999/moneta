import { Fragment, useEffect, useState } from 'react'
import { getActuals, getPaymentRefs, createActual, deleteActual } from '../api/client'
import { eur } from '../api/format'
import BinButton from '../components/BinButton'
import { useYear } from '../contexts/YearContext'
import type { Actual, PaymentRef } from '../api/types'

export default function Actuals() {
  const { year } = useYear()
  const [items, setItems] = useState<Actual[]>([])
  const [refs, setRefs] = useState<PaymentRef[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function toggle(code: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code); else next.add(code)
      return next
    })
  }

  const [paymentRefId, setPaymentRefId] = useState('')
  const [period, setPeriod] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [consultant, setConsultant] = useState('')

  function load() {
    setLoading(true)
    Promise.all([getActuals(year), getPaymentRefs(year)])
      .then(([acts, rs]) => { setItems(acts); setRefs(rs); if (rs.length > 0) setPaymentRefId(String(rs[0].id)) })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [year])

  function openForm() {
    setError(null); setPeriod(''); setAmount('')
    setDate(new Date().toISOString().slice(0, 10)); setDescription(''); setConsultant('')
    if (refs.length > 0) setPaymentRefId(String(refs[0].id))
    setShowForm(true)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null)
    try {
      await createActual({
        paymentRefId: Number(paymentRefId), fiscalYear: year,
        period, amountEur: Number(amount), date,
        description: description || undefined,
        consultant: consultant || undefined,
        source: 'manual',
      })
      setShowForm(false); load()
    } catch (e) { setError(String(e)) }
    finally { setSaving(false) }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this actual?')) return
    try { await deleteActual(id); load() }
    catch (e) { setError(String(e)) }
  }

  const total = items.reduce((s, a) => s + a.amountEur, 0)
  const sourceColor: Record<string, string> = { manual: '#64748b', invoice: '#1d4ed8', import: '#7c3aed' }

  return (
    <>
      <div className="page-header">
        <h1>Actuals — {year}</h1>
        <button onClick={openForm} disabled={refs.length === 0}>+ Add Actual</button>
      </div>
      <div className="page-content">
        {refs.length === 0 && !loading && (
          <p className="text-muted" style={{ marginBottom: 12 }}>No payment refs for {year} — add payment refs first.</p>
        )}
        {error && !showForm && <p style={{ color: 'var(--clr-danger)', marginBottom: 12 }}>{error}</p>}
        <div className="card">
          <div className="card-header">
            <h2>Booked Expenditure</h2>
            {items.length > 0 && <span className="text-muted text-sm">Total spent: <strong>{eur(total)}</strong></span>}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Payment Ref</th>
                  <th>Period</th>
                  <th>Date</th>
                  <th>Consultant</th>
                  <th>Description</th>
                  <th>Source</th>
                  <th className="num">Amount (€)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="empty-state">Loading…</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={8} className="empty-state">No actuals for {year}.</td></tr>
                ) : (() => {
                  const groups = new Map<string, Actual[]>()
                  for (const a of items) {
                    if (!groups.has(a.paymentRefCode)) groups.set(a.paymentRefCode, [])
                    groups.get(a.paymentRefCode)!.push(a)
                  }
                  return [...groups.entries()].map(([code, groupItems]) => {
                    const open = !collapsed.has(code)
                    const groupTotal = groupItems.reduce((s, a) => s + a.amountEur, 0)
                    return (
                      <Fragment key={code}>
                        <tr onClick={() => toggle(code)} style={{ cursor: 'pointer', background: 'var(--clr-bg-soft, #f8fafc)', userSelect: 'none' }}>
                          <td colSpan={4}>
                            <span style={{ marginRight: 6, fontSize: 10, color: 'var(--clr-muted)' }}>{open ? '▼' : '▶'}</span>
                            <span className="code-badge" style={{ fontFamily: 'monospace', fontSize: 11 }}>{code}</span>
                            <span className="text-muted text-sm" style={{ marginLeft: 8 }}>{groupItems.length} {groupItems.length === 1 ? 'entry' : 'entries'}</span>
                          </td>
                          <td></td>
                          <td></td>
                          <td className="num" style={{ fontWeight: 600 }}><span className="eur">{eur(groupTotal)}</span></td>
                          <td></td>
                        </tr>
                        {open && groupItems.map(a => (
                          <tr key={a.id}>
                            <td></td>
                            <td className="text-sm" style={{ fontFamily: 'monospace' }}>{a.period}</td>
                            <td className="text-sm text-muted">{a.date}</td>
                            <td className="text-muted text-sm">{a.consultant ?? '—'}</td>
                            <td className="text-sm text-muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description ?? '—'}</td>
                            <td><span style={{ fontSize: 11, fontWeight: 600, color: sourceColor[a.source] ?? 'inherit', textTransform: 'capitalize' }}>{a.source}</span></td>
                            <td className="num"><span className="eur">{eur(a.amountEur)}</span></td>
                            <td>
                              {a.source === 'manual' && (
                                <BinButton onClick={() => handleDelete(a.id)} />
                              )}
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
            <h3>Add Actual — {year}</h3>
            {error && <p style={{ color: 'var(--clr-danger)', marginBottom: 12, fontSize: 13 }}>{error}</p>}
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div>
                  <label>Payment Ref</label>
                  <select value={paymentRefId} onChange={e => setPaymentRefId(e.target.value)} required>
                    {refs.filter(r => r.isActive || String(r.id) === paymentRefId).map(r => <option key={r.id} value={r.id}>{r.paymentRefId} — {r.description}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row cols-2">
                <div><label>Period</label><input placeholder="e.g. 2026-05" value={period} onChange={e => setPeriod(e.target.value)} required /></div>
                <div><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
              </div>
              <div className="form-row cols-2">
                <div><label>Amount (€)</label><input type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required /></div>
                <div><label>Consultant</label><input placeholder="e.g. Altia" value={consultant} onChange={e => setConsultant(e.target.value)} /></div>
              </div>
              <div className="form-row">
                <div><label>Description</label><input placeholder="e.g. Invoice 2026-05 verified" value={description} onChange={e => setDescription(e.target.value)} /></div>
              </div>
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
