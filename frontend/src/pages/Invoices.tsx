import { useEffect, useState } from 'react'
import { getInvoices, createInvoice, deleteInvoice, getPaymentRefs, getVerification, getSplit, getInvoiceLines, verifyInvoice, disputeInvoice, extractInvoice, exportInvoiceExcel } from '../api/client'
import { eur } from '../api/format'
import { useYear } from '../contexts/YearContext'
import type { Invoice, PaymentRef, Verification, Split, MpsSplitLine, InvoiceLineInput } from '../api/types'
import VerificationReview from '../components/VerificationReview'
import InvoiceWizard from '../components/InvoiceWizard'

const STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  received: { bg: '#dbeafe', fg: '#1d4ed8' },
  verified: { bg: '#dcfce7', fg: '#15803d' },
  disputed: { bg: '#fee2e2', fg: '#b91c1c' },
}

function VerificationPanel({ invoice, onClose, onChanged }: { invoice: Invoice; onClose: () => void; onChanged: () => void }) {
  const [v, setV] = useState<Verification | null>(null)
  const [split, setSplit] = useState<Split | null>(null)
  const [lines, setLines] = useState<MpsSplitLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [acting, setActing] = useState(false)

  useEffect(() => {
    setLoading(true)
    const lineSource = invoice.status === 'verified'
      ? getInvoiceLines(invoice.id)
      : getSplit(invoice.id).then(s => { setSplit(s); return s.lines })
    Promise.all([getVerification(invoice.id), lineSource])
      .then(([ver, ls]) => { setV(ver); setLines(ls) })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [invoice.id, invoice.status])

  async function act(kind: 'verify' | 'dispute') {
    setActing(true); setError(null)
    try {
      const data = { verifiedBy: 'officer', note: note || undefined }
      if (kind === 'verify') await verifyInvoice(invoice.id, data)
      else await disputeInvoice(invoice.id, data)
      onChanged(); onClose()
    } catch (e) { setError(String(e)) }
    finally { setActing(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <h3>Verify Invoice — {invoice.invoiceRef}</h3>
        <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
          {invoice.consultant} · {invoice.paymentRefCode} · {invoice.period}
        </p>
        {error && <p style={{ color: 'var(--clr-danger)', marginBottom: 12 }}>{error}</p>}
        {loading ? <p className="text-muted">Loading…</p> : v && (
          <>
            <VerificationReview invoice={invoice} v={v} split={split} lines={lines} />

            {invoice.status === 'received' ? (
              <>
                <div className="form-row"><div>
                  <label>Note (optional)</label>
                  <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. reviewed against May timesheet" />
                </div></div>
                <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
                  Verifying books an actual of {eur(invoice.claimedAmountEur)} against {invoice.paymentRefCode} and saves the MPS split above.
                </p>
                <div className="form-actions">
                  <button type="button" className="danger" disabled={acting} onClick={() => act('dispute')}>Dispute</button>
                  <button type="button" disabled={acting} onClick={() => act('verify')}>{acting ? 'Saving…' : 'Verify & book'}</button>
                </div>
              </>
            ) : (
              <p className="text-muted text-sm">
                Already <strong>{invoice.status}</strong>{invoice.verifiedBy ? ` by ${invoice.verifiedBy}` : ''}.
                {invoice.status === 'verified' && ' Booked as an actual; split saved above.'}
              </p>
            )}
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

  function load() {
    setLoading(true)
    Promise.all([getInvoices(year), getPaymentRefs(year)])
      .then(([inv, rs]) => { setInvoices(inv); setRefs(rs) })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [year])

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
                ) : invoices.length === 0 ? (
                  <tr><td colSpan={8} className="empty-state">No invoices for {year}. Add one to verify against Taskman.</td></tr>
                ) : invoices.map(inv => {
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
                          <button className="danger" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => handleDelete(inv.id)}>Delete</button>
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
              {extracting && <p className="text-muted text-sm" style={{ marginTop: 6 }}>Reading PDF…</p>}
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
                <div><label>Consultant</label><input value={consultant} onChange={e => setConsultant(e.target.value)} placeholder="e.g. Altia" required /></div>
              </div>
              <div className="form-row">
                <div>
                  <label>Payment Ref <span style={{ color: 'var(--clr-danger)' }}>*</span></label>
                  <select value={paymentRefId} onChange={e => setPaymentRefId(e.target.value)} required>
                    <option value="">— select the payment ref —</option>
                    {refs.map(r => <option key={r.id} value={r.id}>{r.paymentRefId}</option>)}
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

      {verifyItem && <VerificationPanel invoice={verifyItem} onClose={() => setVerifyItem(null)} onChanged={load} />}
      {showWizard && <InvoiceWizard year={year} refs={refs} onClose={() => setShowWizard(false)} onDone={load} />}
    </>
  )
}
