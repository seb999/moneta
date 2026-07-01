import { useEffect, useState } from 'react'
import { getInvoices, createInvoice, updateInvoice, deleteInvoice, getPaymentRefs, getVerification, getSplit, getInvoiceLines, verifyInvoice, disputeInvoice, extractInvoice, exportInvoiceExcel, getCompanies } from '../api/client'
import { eur } from '../api/format'
import BinButton from '../components/BinButton'
import { useYear } from '../contexts/YearContext'
import type { Company, Invoice, PaymentRef, Verification, Split, MpsSplitLine, InvoiceLineInput } from '../api/types'
import VerificationReview from '../components/VerificationReview'
import InvoiceWizard from '../components/InvoiceWizard'
import ExtractionProgress from '../components/ExtractionProgress'

const STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  received: { bg: '#dbeafe', fg: '#1d4ed8' },
  verified: { bg: '#dcfce7', fg: '#15803d' },
  disputed: { bg: '#fee2e2', fg: '#b91c1c' },
}

function VerificationPanel({ invoice, refs, companies, onClose, onChanged }: {
  invoice: Invoice; refs: PaymentRef[]; companies: Company[]; onClose: () => void; onChanged: () => void
}) {
  const [cur, setCur] = useState(invoice)
  const [v, setV] = useState<Verification | null>(null)
  const [split, setSplit] = useState<Split | null>(null)
  const [lines, setLines] = useState<MpsSplitLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [acting, setActing] = useState(false)
  const [reload, setReload] = useState(0)

  // edit form (disputed only)
  const [editing, setEditing] = useState(false)
  const [editConsultant, setEditConsultant] = useState(invoice.consultant)
  const [editInvoiceRef, setEditInvoiceRef] = useState(invoice.invoiceRef)
  const [editPeriod, setEditPeriod] = useState(invoice.period)
  const [editRefId, setEditRefId] = useState(String(invoice.paymentRefId ?? ''))
  const [editAmount, setEditAmount] = useState(String(invoice.claimedAmountEur))
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    setLoading(true); setV(null); setSplit(null); setLines([])
    const lineSource = cur.status === 'verified'
      ? getInvoiceLines(cur.id)
      : getSplit(cur.id).then(s => { setSplit(s); return s.lines })
    Promise.all([getVerification(cur.id), lineSource])
      .then(([ver, ls]) => { setV(ver); setLines(ls) })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [cur.id, cur.status, reload])

  async function act(kind: 'verify' | 'dispute') {
    setActing(true); setError(null)
    try {
      const data = { verifiedBy: 'officer', note: note || undefined }
      if (kind === 'verify') await verifyInvoice(cur.id, data)
      else await disputeInvoice(cur.id, data)
      onChanged(); onClose()
    } catch (e) { setError(String(e)) }
    finally { setActing(false) }
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault(); setEditSaving(true); setError(null)
    try {
      await updateInvoice(cur.id, {
        consultant: editConsultant, invoiceRef: editInvoiceRef, period: editPeriod,
        paymentRefId: Number(editRefId), claimedAmountEur: Number(editAmount),
      })
      const ref = refs.find(r => String(r.id) === editRefId)
      setCur(prev => ({
        ...prev,
        consultant: editConsultant, invoiceRef: editInvoiceRef, period: editPeriod,
        paymentRefId: Number(editRefId), paymentRefCode: ref?.paymentRefId ?? prev.paymentRefCode,
        claimedAmountEur: Number(editAmount),
        status: 'received', verifiedBy: null, verifiedAt: null,
      }))
      setEditing(false)
      setReload(r => r + 1)
      onChanged()
    } catch (e) { setError(String(e)) }
    finally { setEditSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <h3>Verify Invoice — {cur.invoiceRef}</h3>
        <p className="text-muted text-sm" style={{ marginBottom: 4 }}>
          {cur.consultant} · {cur.period}
        </p>
        <p className="text-muted text-sm" style={{ marginBottom: 16, fontFamily: 'monospace', fontSize: 11 }}>
          Taskman lookup: ref = <strong>{cur.paymentRefCode ?? '(not set)'}</strong>, period = <strong>{cur.period}</strong>
        </p>
        {error && <p style={{ color: 'var(--clr-danger)', marginBottom: 12 }}>{error}</p>}
        {loading ? <p className="text-muted">Loading…</p> : v && (
          <>
            <VerificationReview invoice={cur} v={v} split={split} lines={lines} />

            {cur.status !== 'verified' && editing && (
              <form onSubmit={handleEditSave}>
                <div style={{ borderTop: '1px solid var(--clr-border)', marginTop: 4, paddingTop: 14 }}>
                  <div className="form-row cols-2">
                    <div>
                      <label>Consultant</label>
                      <select value={editConsultant} onChange={e => setEditConsultant(e.target.value)} required>
                        <option value="">— select —</option>
                        {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div><label>Invoice Ref</label><input value={editInvoiceRef} onChange={e => setEditInvoiceRef(e.target.value)} required /></div>
                  </div>
                  <div className="form-row cols-2">
                    <div><label>Period (YYYY-MM)</label><input value={editPeriod} onChange={e => setEditPeriod(e.target.value)} pattern="\d{4}-\d{2}" required /></div>
                    <div><label>Claimed (€)</label><input type="number" step="0.01" min="0" value={editAmount} onChange={e => setEditAmount(e.target.value)} required /></div>
                  </div>
                  <div className="form-row">
                    <div>
                      <label>Payment Ref</label>
                      <select value={editRefId} onChange={e => setEditRefId(e.target.value)} required>
                        <option value="">— select —</option>
                        {refs.filter(r => r.isActive || String(r.id) === editRefId).map(r => (
                          <option key={r.id} value={r.id}>{r.paymentRefId}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="button" className="secondary" onClick={() => setEditing(false)}>Cancel</button>
                    <button type="submit" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save & re-check'}</button>
                  </div>
                </div>
              </form>
            )}

            {cur.status === 'received' && !editing ? (
              <>
                <div className="form-row"><div>
                  <label>Note (optional)</label>
                  <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. reviewed against May timesheet" />
                </div></div>
                <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
                  Verifying books an actual of {eur(cur.claimedAmountEur)} against {cur.paymentRefCode} and saves the MPS split above.
                </p>
                <div className="form-actions">
                  <button type="button" className="secondary" onClick={() => setEditing(true)}>Edit invoice</button>
                  <button type="button" className="danger" disabled={acting} onClick={() => act('dispute')}>Dispute</button>
                  <button type="button" disabled={acting} onClick={() => act('verify')}>{acting ? 'Saving…' : 'Verify & book'}</button>
                </div>
              </>
            ) : cur.status === 'disputed' && !editing ? (
              <>
                <p className="text-muted text-sm" style={{ marginBottom: 10 }}>
                  Disputed{cur.verifiedBy ? ` by ${cur.verifiedBy}` : ''}.
                  {cur.note && <> Reason: <em>{cur.note}</em></>}
                </p>
                <div className="form-actions">
                  <button type="button" className="secondary" onClick={() => setEditing(true)}>Edit & re-check</button>
                </div>
              </>
            ) : cur.status === 'verified' ? (
              <p className="text-muted text-sm">
                Already <strong>{cur.status}</strong>{cur.verifiedBy ? ` by ${cur.verifiedBy}` : ''}.
                {cur.status === 'verified' && ' Booked as an actual; split saved above.'}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

export default function Invoices() {
  const { year } = useYear()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [refs, setRefs] = useState<PaymentRef[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [saving, setSaving] = useState(false)
  const [verifyItem, setVerifyItem] = useState<Invoice | null>(null)

  const [consultant, setConsultant] = useState('')
  const [invoiceRef, setInvoiceRef] = useState('')
  const [paymentRefId, setPaymentRefId] = useState('')
  const [period, setPeriod] = useState('')
  const [amount, setAmount] = useState('')
  const [receivedDate, setReceivedDate] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)
  const [extractedLines, setExtractedLines] = useState<InvoiceLineInput[]>([])
  const [filterConsultant, setFilterConsultant] = useState('')
  const [filterRef, setFilterRef] = useState('')

  function load() {
    setLoading(true)
    Promise.all([getInvoices(year), getPaymentRefs(year)])
      .then(([inv, rs]) => { setInvoices(inv); setRefs(rs) })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { setFilterConsultant(''); setFilterRef(''); load() }, [year])
  useEffect(() => { getCompanies().then(setCompanies).catch(() => {}) }, [])

  function openForm() {
    setError(null); setExtractMsg(null); setExtractedLines([])
    setConsultant(''); setInvoiceRef(''); setPeriod(''); setAmount('')
    setReceivedDate(new Date().toISOString().slice(0, 10))
    setPaymentRefId('') // force an explicit choice — don't default to the first ref
    setShowForm(true)
  }

  async function handleExtract(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setExtracting(true); setError(null); setExtractMsg(null)
    try {
      const x = await extractInvoice(file, year)
      if (x.consultant) setConsultant(x.consultant)
      if (x.invoiceRef) setInvoiceRef(x.invoiceRef)
      if (x.period) setPeriod(x.period)
      if (x.claimedAmountEur != null) setAmount(String(x.claimedAmountEur))
      if (x.suggestedPaymentRefId != null) setPaymentRefId(String(x.suggestedPaymentRefId))
      setExtractedLines(x.lines ?? [])
      const bits = [
        x.suggestedPaymentRefCode
          ? `matched payment ref ${x.suggestedPaymentRefCode}`
          : x.paymentRefHint ? `no payment-ref match for "${x.paymentRefHint}"` : null,
        x.lines?.length ? `${x.lines.length} invoice line(s) captured` : 'no invoice line detail found',
        x.notes,
      ].filter(Boolean)
      setExtractMsg(`Pre-filled from PDF. Review every field before saving${bits.length ? ' — ' + bits.join('; ') : '.'}`)
    } catch (e) {
      setError(`Extraction failed: ${String(e)}`)
    } finally {
      setExtracting(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null)
    try {
      await createInvoice({
        consultant, invoiceRef, fiscalYear: year, period,
        paymentRefId: Number(paymentRefId), claimedAmountEur: Number(amount), receivedDate,
        lines: extractedLines.length ? extractedLines : undefined,
      })
      setShowForm(false); load()
    } catch (e) { setError(String(e)) }
    finally { setSaving(false) }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this invoice?')) return
    try { await deleteInvoice(id); load() } catch (e) { setError(String(e)) }
  }

  async function handleExport(id: number) {
    try { await exportInvoiceExcel(id) } catch (e) { setError(String(e)) }
  }

  const filtered = invoices.filter(inv => {
    const matchesConsultant = !filterConsultant || inv.consultant.toLowerCase().includes(filterConsultant.toLowerCase())
    const matchesRef = !filterRef || inv.paymentRefCode === filterRef
    return matchesConsultant && matchesRef
  })

  return (
    <>
      <div className="page-header">
        <h1>Invoices — {year}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowWizard(true)} disabled={refs.length === 0}>⚡ Guided verification</button>
          <button className="secondary" onClick={openForm}>+ Add Invoice</button>
        </div>
      </div>
      <div className="page-content">
        {error && !showForm && <p style={{ color: 'var(--clr-danger)', marginBottom: 12 }}>{error}</p>}
        <div className="card">
          <div className="card-header">
            <span className="text-muted text-sm">
              {loading ? '' : `${filtered.length} of ${invoices.length}`}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ width: 200 }}
                placeholder="Filter by consultant…"
                value={filterConsultant}
                onChange={e => setFilterConsultant(e.target.value)}
              />
              <select
                style={{ width: 220 }}
                value={filterRef}
                onChange={e => setFilterRef(e.target.value)}
              >
                <option value="">All payment refs</option>
                {refs.map(r => <option key={r.id} value={r.paymentRefId}>{r.paymentRefId}</option>)}
              </select>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice Ref</th><th>Consultant</th><th>Payment Ref</th><th>Period</th>
                  <th className="num">Claimed (€)</th><th>Received</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="empty-state">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="empty-state">
                    {invoices.length === 0
                      ? `No invoices for ${year}. Add one to verify against Taskman.`
                      : 'No invoices match the current filters.'}
                  </td></tr>
                ) : filtered.map(inv => {
                  const b = STATUS_BADGE[inv.status] ?? { bg: '#f1f5f9', fg: '#64748b' }
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{inv.invoiceRef}</td>
                      <td>{inv.consultant}</td>
                      <td><span className="code-badge" style={{ fontFamily: 'monospace', fontSize: 11 }}>{inv.paymentRefCode}</span></td>
                      <td className="text-sm">{inv.period}</td>
                      <td className="num"><span className="eur">{eur(inv.claimedAmountEur)}</span></td>
                      <td className="text-sm text-muted">{inv.receivedDate}</td>
                      <td><span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: b.bg, color: b.fg, textTransform: 'capitalize' }}>{inv.status}</span></td>
                      <td>
                        <div className="flex-gap">
                          <button style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setVerifyItem(inv)}>
                            {inv.status === 'received' ? 'Verify' : 'View'}
                          </button>
                          {inv.status === 'verified' && (
                            <button className="secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => handleExport(inv.id)}>Export Excel</button>
                          )}
                          <BinButton onClick={() => handleDelete(inv.id)} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Add Invoice — {year}</h3>
            <div style={{ background: 'var(--clr-bg-soft, #f8fafc)', border: '1px dashed var(--clr-border)', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Pre-fill from invoice PDF</label>
              <p className="text-muted text-sm" style={{ margin: '2px 0 8px' }}>
                Upload the PDF and the assistant extracts consultant, period and amount. Review every field before saving.
              </p>
              <input type="file" accept="application/pdf,.pdf" onChange={handleExtract} disabled={extracting} />
              <ExtractionProgress extracting={extracting} />
              {extractMsg && <p className="text-sm" style={{ marginTop: 6, color: 'var(--clr-green)' }}>{extractMsg}</p>}
            </div>
            {refs.length === 0 && (
              <p style={{ color: 'var(--clr-danger)', marginBottom: 12, fontSize: 13 }}>
                No payment refs for {year} yet — add one on the MPS Codes page before creating an invoice.
              </p>
            )}
            {error && <p style={{ color: 'var(--clr-danger)', marginBottom: 12, fontSize: 13 }}>{error}</p>}
            <form onSubmit={handleCreate}>
              <div className="form-row cols-2">
                <div><label>Invoice Ref</label><input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} placeholder="e.g. ALT-2026-05" required /></div>
                <div>
                  <label>Consultant</label>
                  <select value={consultant} onChange={e => setConsultant(e.target.value)} required>
                    <option value="">— select company —</option>
                    {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div>
                  <label>Payment Ref <span style={{ color: 'var(--clr-danger)' }}>*</span></label>
                  <select value={paymentRefId} onChange={e => setPaymentRefId(e.target.value)} required>
                    <option value="">— select the payment ref —</option>
                    {refs.filter(r => r.isActive || String(r.id) === paymentRefId).map(r => <option key={r.id} value={r.id}>{r.paymentRefId}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row cols-3">
                <div><label>Period</label><input value={period} onChange={e => setPeriod(e.target.value)} placeholder="YYYY-MM" pattern="\d{4}-\d{2}" required /></div>
                <div><label>Claimed (€)</label><input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required /></div>
                <div><label>Received</label><input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} required /></div>
              </div>
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {verifyItem && <VerificationPanel invoice={verifyItem} refs={refs} companies={companies} onClose={() => setVerifyItem(null)} onChanged={load} />}
      {showWizard && <InvoiceWizard year={year} refs={refs.filter(r => r.isActive)} onClose={() => setShowWizard(false)} onDone={load} />}
    </>
  )
}
