import { useState } from 'react'
import {
  extractInvoice, createInvoice, deleteInvoice, getInvoiceReadiness,
  ingestMonth, getSyncedProjects, getVerification, getSplit, verifyInvoice, disputeInvoice,
} from '../api/client'
import { eur } from '../api/format'
import type { PaymentRef, Readiness, Verification, Split, MpsSplitLine, InvoiceLineInput } from '../api/types'
import VerificationReview from './VerificationReview'
import ExtractionProgress from './ExtractionProgress'

const STEPS = ['Upload', 'Confirm', 'Taskman data', 'Review', 'Decision']

/** Guided, step-by-step invoice verification. Additive helper — it orchestrates the same
 *  endpoints the quick form + Verify panel use, with prerequisite checks between steps. */
export default function InvoiceWizard(
  { year, refs, onClose, onDone }: { year: number; refs: PaymentRef[]; onClose: () => void; onDone: () => void }
) {
  const [step, setStep] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Step 1 — extraction
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)

  // Step 2 — header
  const [consultant, setConsultant] = useState('')
  const [invoiceRef, setInvoiceRef] = useState('')
  const [period, setPeriod] = useState('')
  const [paymentRefId, setPaymentRefId] = useState('')
  const [amount, setAmount] = useState('')
  const [receivedDate] = useState(new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<InvoiceLineInput[]>([])
  const [refHint, setRefHint] = useState<string | null>(null)

  // Created invoice (after Step 2)
  const [invoiceId, setInvoiceId] = useState<number | null>(null)

  // Step 3 — readiness
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [ingestingId, setIngestingId] = useState<number | null>(null)
  const [syncedProjects, setSyncedProjects] = useState<{ projectId: number; name: string }[]>([])
  const [pickProjectId, setPickProjectId] = useState('')

  // Step 4 — review
  const [ver, setVer] = useState<Verification | null>(null)
  const [split, setSplit] = useState<Split | null>(null)
  const [splitLines, setSplitLines] = useState<MpsSplitLine[]>([])

  // Step 5/6 — decision
  const [note, setNote] = useState('')
  const [done, setDone] = useState<'verified' | 'disputed' | null>(null)

  const selectedRef = refs.find(r => String(r.id) === paymentRefId)
  const headerValid = !!consultant && !!invoiceRef && /^\d{4}-\d{2}$/.test(period) && !!paymentRefId && Number(amount) > 0
  const linesSum = lines.reduce((s, l) => s + (l.amountEur ?? 0), 0)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setExtracting(true); setError(null); setExtractMsg(null)
    try {
      const x = await extractInvoice(file, year)
      if (x.consultant) setConsultant(x.consultant)
      if (x.invoiceRef) setInvoiceRef(x.invoiceRef)
      if (x.period) setPeriod(x.period)
      if (x.claimedAmountEur != null) setAmount(String(x.claimedAmountEur))
      if (x.suggestedPaymentRefId != null) setPaymentRefId(String(x.suggestedPaymentRefId))
      setLines(x.lines ?? [])
      setRefHint(x.suggestedPaymentRefCode
        ? `Matched payment ref ${x.suggestedPaymentRefCode}`
        : x.paymentRefHint ? `No confident payment-ref match for "${x.paymentRefHint}" — pick it manually below.` : null)
      setExtractMsg(`Captured ${x.lines?.length ?? 0} invoice line(s). Review every field in the next step.`)
      setStep(2)
    } catch (e) { setError(`Extraction failed: ${String(e)}`) }
    finally { setExtracting(false) }
  }

  // Create (or re-create) the invoice record when leaving the Confirm step.
  async function ensureInvoice() {
    if (invoiceId != null) await deleteInvoice(invoiceId).catch(() => {})
    const inv = await createInvoice({
      consultant, invoiceRef, fiscalYear: year, period,
      paymentRefId: Number(paymentRefId), claimedAmountEur: Number(amount), receivedDate,
      lines: lines.length ? lines : undefined,
    })
    setInvoiceId(inv.id)
    return inv.id
  }

  async function gotoReadiness() {
    setBusy(true); setError(null)
    try {
      await ensureInvoice()
      const r = await getInvoiceReadiness(Number(paymentRefId), period)
      setReadiness(r)
      if (!r.derivedFromHistory && syncedProjects.length === 0)
        getSyncedProjects().then(setSyncedProjects).catch(() => {})
      setStep(3)
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }

  async function refreshReadiness() {
    const r = await getInvoiceReadiness(Number(paymentRefId), period); setReadiness(r)
  }

  async function ingestProject(projectId: number) {
    setIngestingId(projectId); setError(null)
    try { await ingestMonth(year, period, { projectId }); await refreshReadiness() }
    catch (e) { setError(String(e)) } finally { setIngestingId(null) }
  }

  async function gotoReview() {
    setBusy(true); setError(null)
    try {
      const [v, s] = await Promise.all([getVerification(invoiceId!), getSplit(invoiceId!)])
      setVer(v); setSplit(s); setSplitLines(s.lines); setStep(4)
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }

  async function decide(kind: 'verify' | 'dispute') {
    setBusy(true); setError(null)
    try {
      const data = { verifiedBy: 'officer', note: note || undefined }
      if (kind === 'verify') await verifyInvoice(invoiceId!, data)
      else await disputeInvoice(invoiceId!, data)
      setDone(kind === 'verify' ? 'verified' : 'disputed'); setStep(6); onDone()
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }

  async function cancel() {
    if (invoiceId != null && done == null) await deleteInvoice(invoiceId).catch(() => {})
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={cancel}>
      <div className="modal" style={{ maxWidth: 780 }} onClick={e => e.stopPropagation()}>
        <h3>Guided invoice verification</h3>

        {/* Stepper */}
        <div style={{ display: 'flex', gap: 6, margin: '12px 0 18px' }}>
          {STEPS.map((label, i) => {
            const n = i + 1
            const state = step > n || (step === 6 && true) ? 'done' : step === n ? 'active' : 'todo'
            return (
              <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  height: 4, borderRadius: 2, marginBottom: 6,
                  background: state === 'todo' ? 'var(--clr-border)' : 'var(--clr-primary)',
                }} />
                <span className="text-sm" style={{ color: state === 'active' ? 'var(--clr-primary)' : 'var(--clr-muted)', fontWeight: state === 'active' ? 700 : 400 }}>
                  {n}. {label}
                </span>
              </div>
            )
          })}
        </div>

        {error && <p style={{ color: 'var(--clr-danger)', marginBottom: 12 }}>{error}</p>}

        {/* ── Step 1: Upload ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
              Upload the invoice PDF to auto-fill the fields and read its line items, or skip to enter manually.
            </p>
            <input type="file" accept="application/pdf,.pdf" onChange={handleFile} disabled={extracting} />
            <ExtractionProgress extracting={extracting} />
            {extractMsg && <p className="text-sm" style={{ marginTop: 8, color: 'var(--clr-green)' }}>{extractMsg}</p>}
          </div>
        )}

        {/* ── Step 2: Confirm header ─────────────────────────────────────── */}
        {step === 2 && (
          <div>
            {extractMsg && <p className="text-muted text-sm" style={{ marginBottom: 10 }}>{extractMsg}</p>}
            <div className="form-row cols-2">
              <div><label>Consultant</label><input value={consultant} onChange={e => setConsultant(e.target.value)} /></div>
              <div><label>Invoice ref</label><input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} /></div>
            </div>
            <div className="form-row cols-2">
              <div><label>Period (YYYY-MM)</label><input value={period} onChange={e => setPeriod(e.target.value)} placeholder="2026-05" /></div>
              <div><label>Claimed amount (€)</label><input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div>
                <label>Payment ref <span style={{ color: 'var(--clr-danger)' }}>*</span></label>
                <select value={paymentRefId} onChange={e => setPaymentRefId(e.target.value)} required>
                  <option value="">— select the payment ref —</option>
                  {refs.map(r => <option key={r.id} value={r.id}>{r.paymentRefId}{r.description ? ` — ${r.description}` : ''}</option>)}
                </select>
                {refHint && <p className="text-sm" style={{ marginTop: 4, color: selectedRef ? 'var(--clr-muted)' : 'var(--clr-danger)' }}>{refHint}</p>}
              </div>
            </div>
            {lines.length > 0 && (
              <p className="text-muted text-sm">
                {lines.length} invoice line(s) captured, summing to <strong>{eur(linesSum)}</strong>
                {Math.abs(linesSum - Number(amount)) > 0.5 && Number(amount) > 0 &&
                  <span style={{ color: 'var(--clr-danger)' }}> — doesn't match the claimed {eur(Number(amount))}; check the extraction.</span>}
              </p>
            )}
          </div>
        )}

        {/* ── Step 3: Taskman readiness ──────────────────────────────────── */}
        {step === 3 && readiness && (
          <div>
            <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
              Taskman cost data must be ingested for <strong>{period}</strong> before this invoice can be reconciled.
            </p>
            {readiness.derivedFromHistory ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Project</th><th className="num">Cost rows ({period})</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {readiness.projects.map(p => (
                      <tr key={p.projectId}>
                        <td>{p.name} <span className="text-muted text-sm">#{p.projectId}</span></td>
                        <td className="num text-sm">{p.rows}</td>
                        <td>{p.ingested
                          ? <span style={{ color: 'var(--clr-green)', fontWeight: 600, fontSize: 12 }}>✓ ingested</span>
                          : <span style={{ color: 'var(--clr-danger)', fontWeight: 600, fontSize: 12 }}>✗ missing</span>}</td>
                        <td>{!p.ingested &&
                          <button className="secondary" style={{ fontSize: 11, padding: '3px 8px' }}
                            disabled={ingestingId === p.projectId} onClick={() => ingestProject(p.projectId)}>
                            {ingestingId === p.projectId ? 'Ingesting…' : 'Ingest'}
                          </button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="card"><div className="card-body">
                <p className="text-sm" style={{ marginBottom: 8 }}>
                  No projects are linked to this payment ref yet (no prior ingestion). Pick a project to ingest for {period}:
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={pickProjectId} onChange={e => setPickProjectId(e.target.value)} style={{ flex: 1 }}>
                    <option value="">— select a project —</option>
                    {syncedProjects.map(p => <option key={p.projectId} value={p.projectId}>{p.name} (#{p.projectId})</option>)}
                  </select>
                  <button disabled={!pickProjectId || ingestingId != null}
                    onClick={() => ingestProject(Number(pickProjectId))}>
                    {ingestingId != null ? 'Ingesting…' : 'Ingest'}
                  </button>
                </div>
              </div></div>
            )}
            <p className="text-sm" style={{ marginTop: 12, color: readiness.totalCostRows > 0 ? 'var(--clr-green)' : 'var(--clr-danger)' }}>
              {readiness.totalCostRows > 0
                ? `${readiness.totalCostRows} cost row(s) found for this ref/period — ready to reconcile.`
                : 'No cost rows for this ref/period yet — reconciliation will show zero Taskman cost until you ingest.'}
            </p>
          </div>
        )}

        {/* ── Step 4: Reconciliation ─────────────────────────────────────── */}
        {step === 4 && ver && (
          <div style={{ maxHeight: '52vh', overflowY: 'auto' }}>
            <VerificationReview invoice={{ id: invoiceId!, consultant, invoiceRef, fiscalYear: year, period, paymentRefId: Number(paymentRefId), paymentRefCode: selectedRef?.paymentRefId ?? null, claimedAmountEur: Number(amount), receivedDate, status: 'received', verifiedBy: null, verifiedAt: null, note: null }}
              v={ver} split={split} lines={splitLines} />
          </div>
        )}

        {/* ── Step 5: Decision ───────────────────────────────────────────── */}
        {step === 5 && (
          <div>
            <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
              Verifying books an actual of <strong>{eur(Number(amount))}</strong> against <strong>{selectedRef?.paymentRefId}</strong> and saves the MPS split.
            </p>
            <div className="form-row"><div>
              <label>Note (optional)</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. reviewed against May timesheet" />
            </div></div>
            <div className="form-actions">
              <button className="danger" disabled={busy} onClick={() => decide('dispute')}>Dispute</button>
              <button disabled={busy} onClick={() => decide('verify')}>{busy ? 'Saving…' : 'Verify & book'}</button>
            </div>
          </div>
        )}

        {/* ── Step 6: Done ───────────────────────────────────────────────── */}
        {step === 6 && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ fontSize: 18, fontWeight: 700, color: done === 'verified' ? 'var(--clr-green)' : 'var(--clr-danger)' }}>
              Invoice {done}
            </p>
            <p className="text-muted text-sm" style={{ marginTop: 6 }}>
              {done === 'verified'
                ? `Booked an actual of ${eur(Number(amount))} against ${selectedRef?.paymentRefId}.`
                : 'Marked as disputed — no actual was booked.'}
            </p>
          </div>
        )}

        {/* Footer nav */}
        <div className="form-actions" style={{ marginTop: 18, justifyContent: 'space-between' }}>
          <button className="secondary" onClick={cancel}>{step === 6 ? 'Close' : 'Cancel'}</button>
          {step < 6 && (
            <div style={{ display: 'flex', gap: 8 }}>
              {step > 1 && <button className="secondary" disabled={busy} onClick={() => setStep(step - 1)}>Back</button>}
              {step === 1 && <button className="secondary" onClick={() => setStep(2)}>Enter manually →</button>}
              {step === 2 && <button disabled={!headerValid || busy} onClick={gotoReadiness}>{busy ? 'Saving…' : 'Next →'}</button>}
              {step === 3 && <button disabled={busy} onClick={gotoReview}>{busy ? 'Loading…' : 'Next →'}</button>}
              {step === 4 && <button disabled={busy} onClick={() => setStep(5)}>Next →</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
