import { useEffect, useState } from 'react'
import { getPaymentRefSummary } from '../api/client'
import { eur, eurClass } from '../api/format'
import { useYear } from '../contexts/YearContext'
import type { PaymentRefSummary } from '../api/types'

function ConsumptionBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const color = pct > 90 ? '#dc2626' : pct > 70 ? '#d97706' : '#16a34a'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 120 }}>
      <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--clr-muted)', width: 34, textAlign: 'right' }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

export default function BudgetOverview() {
  const { year } = useYear()
  const [rows, setRows] = useState<PaymentRefSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getPaymentRefSummary(year)
      .then(setRows)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [year])

  const totals = rows.reduce(
    (acc, r) => ({
      ca: acc.ca + r.caAmountEur,
      pa: acc.pa + r.paAmountEur,
      committed: acc.committed + r.committedEur,
      availableToCommit: acc.availableToCommit + r.availableToCommitEur,
      spent: acc.spent + r.spentEur,
      availableToPay: acc.availableToPay + r.availableToPayEur,
    }),
    { ca: 0, pa: 0, committed: 0, availableToCommit: 0, spent: 0, availableToPay: 0 }
  )

  return (
    <>
      <div className="page-header">
        <h1>Budget Overview — {year}</h1>
      </div>
      <div className="page-content">
        {loading && <p className="text-muted">Loading…</p>}
        {error && <p style={{ color: 'var(--clr-danger)' }}>{error}</p>}
        {!loading && !error && (
          <div className="card">
            <div className="card-header">
              <h2>Payment Refs</h2>
              <span className="text-muted text-sm">{rows.length} refs</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Payment Ref ID</th>
                    <th>Description</th>
                    <th className="num">CA Budget</th>
                    <th className="num">PA Budget</th>
                    <th className="num">Committed</th>
                    <th className="num">Avail. to Commit</th>
                    <th className="num">Spent</th>
                    <th className="num">Avail. to Pay</th>
                    <th>PA Consumption</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="empty-state">
                        No payment refs for {year}. Add payment refs and appropriations to get started.
                      </td>
                    </tr>
                  ) : rows.map(r => (
                    <tr key={r.id}>
                      <td>
                        <span className="code-badge" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                          {r.paymentRefId}
                        </span>
                      </td>
                      <td className="text-sm">{r.description}</td>
                      <td className="num"><span className="eur">{eur(r.caAmountEur)}</span></td>
                      <td className="num"><span className="eur">{eur(r.paAmountEur)}</span></td>
                      <td className="num"><span className="eur">{eur(r.committedEur)}</span></td>
                      <td className="num"><span className={eurClass(r.availableToCommitEur) + ' eur'}>{eur(r.availableToCommitEur)}</span></td>
                      <td className="num"><span className="eur">{eur(r.spentEur)}</span></td>
                      <td className="num"><span className={eurClass(r.availableToPayEur) + ' eur'}>{eur(r.availableToPayEur)}</span></td>
                      <td><ConsumptionBar value={r.spentEur} max={r.paAmountEur} /></td>
                    </tr>
                  ))}
                </tbody>
                {rows.length > 1 && (
                  <tfoot>
                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--clr-border)' }}>
                      <td colSpan={2} className="text-muted" style={{ fontSize: 12 }}>TOTAL</td>
                      <td className="num"><span className="eur">{eur(totals.ca)}</span></td>
                      <td className="num"><span className="eur">{eur(totals.pa)}</span></td>
                      <td className="num"><span className="eur">{eur(totals.committed)}</span></td>
                      <td className="num"><span className={eurClass(totals.availableToCommit) + ' eur'}>{eur(totals.availableToCommit)}</span></td>
                      <td className="num"><span className="eur">{eur(totals.spent)}</span></td>
                      <td className="num"><span className={eurClass(totals.availableToPay) + ' eur'}>{eur(totals.availableToPay)}</span></td>
                      <td><ConsumptionBar value={totals.spent} max={totals.pa} /></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
