import { eur } from '../api/format'
import type { Invoice, Verification, Split, MpsSplitLine } from '../api/types'

export function exportSplitCsv(invoice: Invoice, lines: MpsSplitLine[]) {
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

/** Read-only reconciliation view: Claimed vs Taskman vs Variance, the per-developer
 *  breakdown and the MPS split. Shared by the Verify panel and the guided wizard. */
export default function VerificationReview(
  { invoice, v, split, lines }: { invoice: Invoice; v: Verification; split: Split | null; lines: MpsSplitLine[] }
) {
  const variancePct = v.computedEur !== 0 ? (v.varianceEur / v.computedEur) * 100 : 0
  const within = Math.abs(variancePct) <= 5

  const hasHoursButNoAmount = v.totalHours > 0 && v.computedEur === 0

  return (
    <>
      {hasHoursButNoAmount && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 14px', marginBottom: 14, fontSize: 13 }}>
          <strong style={{ color: '#92400e' }}>Hours found but computed cost is €0.</strong>
          {' '}<span style={{ color: '#78350f' }}>One or more developers have no profile or no matching rate card.
          Fix in <strong>Contractors & Rates</strong> (assign a profile) and <strong>Companies</strong> (add rate card), then re-ingest this period.</span>
        </div>
      )}
      {v.breakdown.length === 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 14px', marginBottom: 14, fontSize: 13 }}>
          <strong style={{ color: '#92400e' }}>No Taskman rows found</strong>
          {' '}<span style={{ color: '#78350f' }}>for ref <strong>{v.paymentRefCode ?? '(none)'}</strong>, period <strong>{v.period}</strong>.
          Check that the invoice period matches what was ingested (format: YYYY-MM).</span>
        </div>
      )}

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
                <tr><td colSpan={5} className="empty-state">No Taskman rows — see warning above.</td></tr>
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
              No per-developer line detail — the Invoice column is blank. That's fine: use the <strong>Claimed</strong> vs <strong>Computed (Taskman)</strong> totals above to decide whether to verify or dispute.
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
    </>
  )
}
