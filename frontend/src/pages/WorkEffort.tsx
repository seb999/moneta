import { useEffect, useState } from 'react'
import { getPaymentRefs, getMonthlySummary, getReportTaskmanProjects, ingestYear } from '../api/client'
import { useYear } from '../contexts/YearContext'
import type { MonthlySummaryRow, PaymentRef } from '../api/types'

function last12Months(): string[] {
  const months: string[] = []
  const d = new Date()
  for (let i = 11; i >= 0; i--) {
    const t = new Date(d.getFullYear(), d.getMonth() - i, 1)
    months.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function fmtMonth(period: string) {
  const [y, m] = period.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleString('en', { month: 'short', year: '2-digit' })
}

export default function WorkEffort() {
  const { year } = useYear()
  const [mode, setMode] = useState<'ref' | 'project'>('ref')

  // Options
  const [paymentRefs, setPaymentRefs] = useState<PaymentRef[]>([])
  const [projects, setProjects] = useState<string[]>([])
  const [selectedRefId, setSelectedRefId] = useState<number | null>(null)
  const [selectedProject, setSelectedProject] = useState<string>('')

  // Data
  const [rows, setRows] = useState<MonthlySummaryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [ingestMsg, setIngestMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const months = last12Months()

  useEffect(() => {
    getPaymentRefs(year).then(refs => {
      setPaymentRefs(refs)
      if (refs.length > 0) setSelectedRefId(refs[0].id)
    }).catch(() => {})
    getReportTaskmanProjects(year).then(ps => {
      setProjects(ps)
      if (ps.length > 0) setSelectedProject(ps[0])
    }).catch(() => {})
  }, [year])

  async function handleLoad() {
    setLoading(true); setError(null); setRows([])
    try {
      const filter = mode === 'ref'
        ? { paymentRefId: selectedRefId ?? undefined }
        : { taskmanProject: selectedProject }
      const data = await getMonthlySummary(year, filter, 12)
      setRows(data)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  // Auto-load whenever the selection changes
  useEffect(() => {
    const ready = mode === 'ref' ? selectedRefId !== null : selectedProject !== ''
    if (ready) handleLoad()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedRefId, selectedProject, year])

  async function handleIngestYear() {
    setIngesting(true); setIngestMsg(null); setError(null)
    try {
      const ingested = await ingestYear(year)
      setIngestMsg(ingested.length > 0
        ? `Ingested: ${ingested.join(', ')}`
        : 'All months already have data.')
      handleLoad()
    } catch (e) { setError(String(e)) }
    finally { setIngesting(false) }
  }

  // Build pivot: developers × months
  const developers = [...new Set(rows.map(r => r.developer))].sort()
  const lookup = new Map(rows.map(r => [`${r.developer}||${r.period}`, r]))

  // Totals per month
  const totalHours = months.map(m =>
    rows.filter(r => r.period === m).reduce((s, r) => s + r.hours, 0))
  const totalAmount = months.map(m =>
    rows.filter(r => r.period === m).reduce((s, r) => s + r.computedAmountEur, 0))

  const canLoad = mode === 'ref' ? selectedRefId !== null : selectedProject !== ''

  return (
    <>
      <div className="page-header">
        <h1>Work Effort — {year}</h1>
      </div>
      <div className="page-content">
        {error && <p style={{ color: 'var(--clr-danger)', marginBottom: 12 }}>{error}</p>}

        {/* Controls */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body" style={{ padding: '14px 18px' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>

              {/* Mode toggle */}
              <div>
                <label>View by</label>
                <div style={{ display: 'flex', border: '1px solid var(--clr-border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  {(['ref', 'project'] as const).map(m => (
                    <button key={m} onClick={() => setMode(m)} style={{
                      borderRadius: 0,
                      background: mode === m ? 'var(--clr-primary)' : 'transparent',
                      color: mode === m ? '#fff' : 'var(--clr-text)',
                      padding: '5px 14px', fontSize: 13,
                    }}>
                      {m === 'ref' ? 'Payment Ref' : 'Project'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selector */}
              {mode === 'ref' ? (
                <div style={{ flex: '0 0 480px' }}>
                  <label>Payment Ref ID</label>
                  <select
                    value={selectedRefId ?? ''}
                    onChange={e => setSelectedRefId(Number(e.target.value))}
                  >
                    {paymentRefs.length === 0 && <option value="">— no refs —</option>}
                    {paymentRefs.map(r => (
                      <option key={r.id} value={r.id}>{r.paymentRefId}{r.description ? ` — ${r.description}` : ''}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div style={{ flex: '0 0 320px' }}>
                  <label>Taskman Project</label>
                  <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
                    {projects.length === 0 && <option value="">— no projects —</option>}
                    {projects.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )}

              {loading && <span className="text-muted text-sm" style={{ paddingBottom: 6 }}>Loading…</span>}

              <button className="secondary" onClick={handleIngestYear} disabled={ingesting} style={{ marginLeft: 'auto' }}>
                {ingesting ? 'Ingesting…' : `Ingest all ${year} months`}
              </button>
            </div>
            {ingestMsg && <p className="text-muted text-sm" style={{ marginTop: 8 }}>{ingestMsg}</p>}
          </div>
        </div>

        {/* Pivot table */}
        {rows.length > 0 && (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 160 }}>Developer</th>
                    {months.map(m => <th key={m} className="num" style={{ minWidth: 72 }}>{fmtMonth(m)}</th>)}
                    <th className="num" style={{ minWidth: 72 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {developers.map(dev => {
                    const devTotal = rows.filter(r => r.developer === dev).reduce((s, r) => s + r.hours, 0)
                    return (
                      <tr key={dev}>
                        <td style={{ fontWeight: 500 }}>{dev}</td>
                        {months.map(m => {
                          const cell = lookup.get(`${dev}||${m}`)
                          return (
                            <td key={m} className="num" style={{ color: cell ? 'inherit' : 'var(--clr-border)' }}>
                              {cell ? cell.hours.toFixed(2) : '—'}
                            </td>
                          )
                        })}
                        <td className="num" style={{ fontWeight: 600 }}>{devTotal.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--clr-border)', fontWeight: 700, background: 'var(--clr-bg)' }}>
                    <td className="text-muted" style={{ fontSize: 11 }}>TOTAL HOURS</td>
                    {totalHours.map((h, i) => (
                      <td key={months[i]} className="num">{h > 0 ? h.toFixed(2) : '—'}</td>
                    ))}
                    <td className="num">{totalHours.reduce((s, h) => s + h, 0).toFixed(2)}</td>
                  </tr>
                  <tr style={{ background: 'var(--clr-bg)' }}>
                    <td className="text-muted" style={{ fontSize: 11 }}>TOTAL €</td>
                    {totalAmount.map((a, i) => (
                      <td key={months[i]} className="num" style={{ fontSize: 12 }}>
                        {a > 0 ? `€ ${a.toLocaleString('en-EU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—'}
                      </td>
                    ))}
                    <td className="num" style={{ fontSize: 12, fontWeight: 700 }}>
                      € {totalAmount.reduce((s, a) => s + a, 0).toLocaleString('en-EU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {!loading && rows.length === 0 && canLoad && (
          <div className="card"><div className="empty-state">No data yet — click Load, or use "Ingest all {year} months" to pull data from Taskman.</div></div>
        )}
      </div>
    </>
  )
}
