import { useEffect, useState } from 'react'
import { getInvoices, createInvoice, deleteInvoice, getPaymentRefs, getVerification, getSplit, getInvoiceLines, verifyInvoice, disputeInvoice, extractInvoice } from '../api/client'
import { eur } from '../api/format'
import { useYear } from '../contexts/YearContext'
import type { Invoice, PaymentRef, Verification, Split, MpsSplitLine, InvoiceLineInput } from '../api/types'

function exportSplitCsv(invoice: Invoice, lines: MpsSplitLine[]) {
  const header = 'MPS Code,Hours,Share %,Amount EUR\n'
  const body = lines.map(l => `${l.mpsCode},${l.hours.toFixed(2)},${l.sharePct.toFixed(1)},${l.amountEur.toFixed(2)}`).join('\n')
  const blob = new Blob([header + body], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `split_${invoice.invoiceRef}_${invoice.period}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

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

  const variancePct = v && v.computedEur !== 0 ? (v.varianceEur / v.computedEur) * 100 : 0
  const within = v ? Math.abs(variancePct) <= 5 : false

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
            {/* Claimed vs computed */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div className="card"><div className="card-body" style={{ textAlign: 'center' }}>
                <p className="text-muted text-sm">Claimed</p>
                <p style={{ fontSize: 20, fontWeight: 700 }}>{eur(v.claimedEur)}</p>
              </div></div>
              <div className="card"><div className="card-body" style={{ textAlign: 'center' }}>
                <p className="text-muted text-sm">Computed (Taskman)</p>
                <p style={{ fontSize: 20, fontWeight: 700 }}>{eur(v.computedEur)}</p>
                <p className="text-muted text-sm">{v.totalHours.toFixed(1)} h</p>
              </div></div>
              <div className="card" style={{ borderColor: within ? 'var(--clr-green)' : 'var(--clr-danger)' }}>
                <div className="card-body" style={{ textAlign: 'center' }}>
                  <p className="text-muted text-sm">Variance</p>
                  <p style={{ fontSize: 20, fontWeight: 700, color: within ? 'var(--clr-green)' : 'var(--clr-danger)' }}>
                    {eur(v.varianceEur)}
                  </p>
                  <p className="text-sm" style={{ color: within ? 'var(--clr-green)' : 'var(--clr-danger)' }}>
                    {variancePct >= 0 ? '+' : ''}{variancePct.toFixed(1)}% {within ? '· within ±5%' : '· over tolerance'}
                  </p>
                </div>
              </div>
            </div>

            {/* Developer breakdown */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><h2>Breakdown — Taskman vs Invoice</h2></div>
              <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
                <table>
                  <thead><tr>
                    <th>Developer</th>
                    <th className="num">Hours</th>
                    <th className="num" title="Exact: hours ÷ 8 × daily rate (no rounding)">Taskman (€)</th>
                    <th className="num" title="As billed on the invoice (LLM-extracted line)">Invoice (€)</th>
                    <th className="num">Diff (€)</th>
                  </tr></thead>
                  <tbody>
                    {v.breakdown.length === 0 ? (
                      <tr><td colSpan={5} className="empty-state">No Taskman cost for this ref/period. Ingest it first.</td></tr>
                    ) : v.breakdown.map((b, i) => (
                      <tr key={i}>
                        <td className="text-sm">{b.developer}</td>
                        <td className="num text-sm">{b.hours.toFixed(2)}</td>
                        <td className="num"><span className="eur">{eur(b.taskmanEur)}</span></td>
                        <td className="num">{v.hasInvoiceLines ? <span className="eur">{eur(b.invoiceEur)}</span> : <span className="text-muted">—</span>}</td>
                        <td className="num text-sm" style={{ color: !v.hasInvoiceLines ? 'inherit' : b.diffEur > 0 ? 'var(--clr-danger)' : b.diffEur < 0 ? 'var(--clr-green)' : 'inherit' }}>
                          {v.hasInvoiceLines ? `${b.diffEur > 0 ? '+' : ''}${eur(b.diffEur)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {v.breakdown.length > 0 && (
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--clr-border)', fontWeight: 700, background: 'var(--clr-bg)' }}>
                        <td className="text-sm">TOTAL</td>
                        <td className="num text-sm">{v.totalHours.toFixed(2)}</td>
                        <td className="num"><span className="eur">{eur(v.computedEur)}</span></td>
                        <td className="num">{v.hasInvoiceLines ? <span className="eur">{eur(v.invoiceLinesTotalEur)}</span> : <span className="text-muted">—</span>}</td>
                        <td className="num text-sm" style={{ color: v.hasInvoiceLines && v.invoiceLinesTotalEur - v.computedEur > 0 ? 'var(--clr-danger)' : 'inherit' }}>
                          {v.hasInvoiceLines ? `${v.invoiceLinesTotalEur - v.computedEur > 0 ? '+' : ''}${eur(v.invoiceLinesTotalEur - v.computedEur)}` : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {!v.hasInvoiceLines && (
                <div className="card-body" style={{ paddingTop: 10 }}>
                  <p className="text-sm text-muted">
                    No per-line invoice detail captured — the Invoice column is blank. Upload the invoice PDF at intake
                    so the extractor can read its line items, or compare against the Claimed total above.
                  </p>
                </div>
              )}
            </div>

            {/* MPS split */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <h2>MPS split {invoice.status === 'received' && <span className="text-muted text-sm" style={{ fontWeight: 400 }}>(preview)</span>}</h2>
                {lines.length > 0 && (
                  <button className="secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => exportSplitCsv(invoice, lines)}>Export CSV</button>
                )}
              </div>
              {split && split.unmappedHours > 0 && (
                <div style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '8px 16px' }}>
                  <p style={{ color: '#b91c1c', fontSize: 12 }}>
                    {split.unmappedHours.toFixed(1)}h are unmapped and excluded from the split — map them on the MPS Codes page and re-ingest for an exact split.
                  </p>
                </div>
              )}
              <div className="table-wrap">
                <table>
                  <thead><tr><th>MPS Code</th><th className="num">Hours</th><th className="num">Share</th><th className="num">Amount (€)</th></tr></thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr><td colSpan={4} className="empty-state">No MPS-attributed hours. Map categories + re-ingest first.</td></tr>
                    ) : lines.map((l, i) => (
                      <tr key={i}>
                        <td><span className="code-badge">{l.mpsCode}</span></td>
                        <td className="num text-sm">{l.hours.toFixed(2)}</td>
                        <td className="num text-sm text-muted">{l.sharePct.toFixed(1)}%</td>
                        <td className="num"><span className="eur">{eur(l.amountEur)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                  {lines.length > 1 && (
                    <tfoot>
                      <tr style={{ fontWeight: 700, borderTop: '2px solid var(--clr-border)' }}>
                        <td className="text-muted" style={{ fontSize: 12 }}>TOTAL</td>
                        <td className="num text-sm">{lines.reduce((s, l) => s + l.hours, 0).toFixed(2)}</td>
                        <td></td>
                        <td className="num"><span className="eur">{eur(lines.reduce((s, l) => s + l.amountEur, 0))}</span></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

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
    if (refs.length > 0) setPaymentRefId(String(refs[0].id))
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

  return (
    <>
      <div className="page-header">
        <h1>Invoices — {year}</h1>
        <button onClick={openForm}>+ Add Invoice</button>
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
                  <label>Payment Ref</label>
                  <select value={paymentRefId} onChange={e => setPaymentRefId(e.target.value)} required>
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
    </>
  )
}
