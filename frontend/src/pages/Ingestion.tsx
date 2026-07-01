import { useEffect, useState } from 'react'
import { ingestMonth, getTaskmanCosts, syncRedmineProjects, getSyncedProjects, getPaymentRefs } from '../api/client'
import { eur } from '../api/format'
import { useYear } from '../contexts/YearContext'
import type { TaskmanCost, IngestSummary, PaymentRef } from '../api/types'

const STATUS_COLOR: Record<string, string> = {
  mapped: '#16a34a',
  assumed_default: '#d97706',
  unmapped: '#dc2626',
  excluded: '#94a3b8',
}

export default function Ingestion() {
  const { year } = useYear()
  const [period, setPeriod] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [mode, setMode] = useState<'ref' | 'project'>('project')
  const [projectId, setProjectId] = useState('')  // '' = all projects
  const [refId, setRefId] = useState('')
  const [projects, setProjects] = useState<{ projectId: number; name: string }[]>([])
  const [paymentRefs, setPaymentRefs] = useState<PaymentRef[]>([])
  const [ingesting, setIngesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<IngestSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [costs, setCosts] = useState<TaskmanCost[]>([])
  const [costPeriod, setCostPeriod] = useState('')
  const [loadingCosts, setLoadingCosts] = useState(false)

  useEffect(() => {
    getSyncedProjects().then(setProjects).catch(() => {})
  }, [])
  useEffect(() => {
    getPaymentRefs(year).then(rs => { setPaymentRefs(rs); if (rs.length) setRefId(String(rs[0].id)) }).catch(() => {})
  }, [year])

  async function handleIngest(e: React.FormEvent) {
    e.preventDefault()
    setIngesting(true)
    setError(null)
    setResult(null)
    try {
      const opts =
        mode === 'ref'        ? { paymentRefId: Number(refId) } :
        projectId             ? { projectId: Number(projectId) } :
        undefined  // project mode with blank = all projects
      const r = await ingestMonth(year, period, opts)
      setResult(r)
      setCostPeriod(period)
      loadCosts(period)
    } catch (e) {
      setError(String(e))
    } finally {
      setIngesting(false)
    }
  }

  async function handleSyncProjects() {
    setSyncing(true)
    setError(null)
    try {
      const count = await syncRedmineProjects()
      alert(`Synced ${count} Redmine projects.`)
    } catch (e) {
      setError(String(e))
    } finally {
      setSyncing(false)
    }
  }

  function loadCosts(p: string) {
    if (!p) return
    setLoadingCosts(true)
    getTaskmanCosts(year, p)
      .then(setCosts)
      .catch(e => setError(String(e)))
      .finally(() => setLoadingCosts(false))
  }

  useEffect(() => {
    if (costPeriod) loadCosts(costPeriod)
  }, [year, costPeriod])

  const unmappedCosts = costs.filter(c => c.attributionStatus === 'unmapped')

  function groupByDeveloper(rows: typeof costs) {
    const map = new Map<string, { key: string; developer: string; paymentRefCode: string | null; attributionStatus: string; hours: number; computedAmountEur: number }>()
    for (const c of rows) {
      const key = `${c.developer}||${c.paymentRefCode ?? ''}||${c.attributionStatus}`
      const existing = map.get(key)
      if (existing) {
        existing.hours += c.hours
        existing.computedAmountEur += c.computedAmountEur
      } else {
        map.set(key, { key, developer: c.developer, paymentRefCode: c.paymentRefCode, attributionStatus: c.attributionStatus, hours: c.hours, computedAmountEur: c.computedAmountEur })
      }
    }
    return [...map.values()].sort((a, b) => a.developer.localeCompare(b.developer))
  }

  return (
    <>
      <div className="page-header">
        <h1>Taskman Ingestion — {year}</h1>
      </div>
      <div className="page-content">
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' }}>
          {/* Control panel */}
          <div>
            <div className="card">
              <div className="card-header"><h2>Ingest Month</h2></div>
              <div className="card-body">
                <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
                  Pulls time entries from Taskman for the selected period, computes cost
                  via contractor rates, and attributes to budget lines.
                </p>
                <form onSubmit={handleIngest}>
                  <div className="form-row">
                    <div>
                      <label htmlFor="ing-period">Period</label>
                      <input
                        id="ing-period"
                        placeholder="YYYY-MM"
                        value={period}
                        onChange={e => setPeriod(e.target.value)}
                        pattern="\d{4}-\d{2}"
                        required
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div>
                      <label>Ingest by</label>
                      <div style={{ display: 'flex', border: '1px solid var(--clr-border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                        {(['ref', 'project'] as const).map(m => (
                          <button key={m} type="button" onClick={() => setMode(m)} style={{
                            borderRadius: 0, flex: 1,
                            background: mode === m ? 'var(--clr-primary)' : 'transparent',
                            color: mode === m ? '#fff' : 'var(--clr-text)',
                            padding: '5px 14px', fontSize: 13,
                          }}>{m === 'ref' ? 'Payment Ref' : 'Project'}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {mode === 'project' ? (
                    <div className="form-row">
                      <div>
                        <label>Project</label>
                        <select value={projectId} onChange={e => setProjectId(e.target.value)}>
                          <option value="">— All projects —</option>
                          {projects.map(p => <option key={p.projectId} value={p.projectId}>{p.name} (#{p.projectId})</option>)}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="form-row">
                      <div>
                        <label>Payment Ref</label>
                        <select value={refId} onChange={e => setRefId(e.target.value)}>
                          {paymentRefs.length === 0 && <option value="">— no refs —</option>}
                          {paymentRefs.filter(r => r.isActive).map(r => <option key={r.id} value={r.id}>{r.paymentRefId}</option>)}
                        </select>
                        <p className="text-muted text-sm" style={{ marginTop: 4 }}>Re-ingests the projects this ref has appeared in.</p>
                      </div>
                    </div>
                  )}
                  <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
                    <button type="submit" disabled={ingesting}>
                      {ingesting ? 'Ingesting…' : 'Run Ingestion'}
                    </button>
                    <button type="button" className="secondary" onClick={handleSyncProjects} disabled={syncing}>
                      {syncing ? 'Syncing…' : 'Sync Projects'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {error && (
              <div className="card mt-16" style={{ borderColor: 'var(--clr-danger)' }}>
                <div className="card-body">
                  <p style={{ color: 'var(--clr-danger)', fontSize: 13 }}>{error}</p>
                </div>
              </div>
            )}

            {result && (
              <div className="card mt-16">
                <div className="card-header"><h2>Result — {result.period}</h2></div>
                <div className="card-body">
                  <table style={{ width: '100%', fontSize: 13 }}>
                    <tbody>
                      <tr><td className="text-muted">Entries processed</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{result.entriesProcessed}</td></tr>
                      <tr><td style={{ color: STATUS_COLOR.mapped }}>Mapped</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{result.mapped}</td></tr>
                      <tr><td style={{ color: STATUS_COLOR.assumed_default }}>Assumed default</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{result.assumedDefault}</td></tr>
                      <tr><td style={{ color: STATUS_COLOR.unmapped }}>Unmapped</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{result.unmapped}</td></tr>
                      <tr><td style={{ color: STATUS_COLOR.excluded }}>Excluded</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{result.excluded}</td></tr>
                      <tr style={{ borderTop: '1px solid var(--clr-border)', fontWeight: 700 }}>
                        <td>Total computed</td>
                        <td style={{ textAlign: 'right' }}>{eur(result.totalComputedEur)}</td>
                      </tr>
                    </tbody>
                  </table>
                  {result.warnings.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <p className="text-muted text-sm" style={{ marginBottom: 6 }}>Warnings:</p>
                      <ul style={{ paddingLeft: 16, fontSize: 12, color: 'var(--clr-muted)' }}>
                        {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Cost viewer */}
          <div>
            <div className="card">
              <div className="card-header">
                <h2>Taskman Costs</h2>
                <div className="flex-gap">
                  <input
                    style={{ width: 120 }}
                    placeholder="YYYY-MM"
                    value={costPeriod}
                    onChange={e => setCostPeriod(e.target.value)}
                    pattern="\d{4}-\d{2}"
                  />
                  <button className="secondary" style={{ fontSize: 12, padding: '5px 12px' }}
                    onClick={() => loadCosts(costPeriod)} disabled={!costPeriod || loadingCosts}>
                    Load
                  </button>
                </div>
              </div>

              {unmappedCosts.length > 0 && (
                <div style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '10px 16px' }}>
                  <p style={{ color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
                    {unmappedCosts.length} unmapped entries — add attribution rules to attribute these.
                  </p>
                </div>
              )}

              <div className="table-wrap">
                {loadingCosts ? (
                  <div className="empty-state">Loading…</div>
                ) : costs.length === 0 ? (
                  <div className="empty-state">
                    {costPeriod ? `No cost data for ${costPeriod}.` : 'Enter a period and click Load.'}
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Developer</th>
                        <th>Payment Ref</th>
                        <th>Status</th>
                        <th className="num">Hours</th>
                        <th className="num">Computed (€)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupByDeveloper(costs).map(row => (
                        <tr key={row.key}>
                          <td style={{ fontWeight: 500 }}>{row.developer}</td>
                          <td>
                            {row.paymentRefCode
                              ? <span className="code-badge" style={{ fontFamily: 'monospace', fontSize: 11 }}>{row.paymentRefCode}</span>
                              : <span className="text-muted text-sm">—</span>}
                          </td>
                          <td>
                            <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[row.attributionStatus] ?? 'inherit' }}>
                              {row.attributionStatus}
                            </span>
                          </td>
                          <td className="num text-sm">{row.hours.toFixed(2)}</td>
                          <td className="num"><span className="eur">{eur(row.computedAmountEur)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 700, borderTop: '2px solid var(--clr-border)' }}>
                        <td colSpan={4} className="text-muted" style={{ fontSize: 12 }}>TOTAL</td>
                        <td className="num">
                          <span className="eur">{eur(costs.reduce((s, c) => s + c.computedAmountEur, 0))}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
