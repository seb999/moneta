import { useEffect, useState } from 'react'
import { getFiscalYears, createFiscalYear } from '../api/client'
import { useYear } from '../contexts/YearContext'
import type { FiscalYear } from '../api/types'

export default function FiscalYears() {
  const { year: selectedYear, setYear } = useYear()
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    getFiscalYears()
      .then(setFiscalYears)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createFiscalYear(Number(newYear))
      setShowForm(false)
      load()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Fiscal Years</h1>
        <button onClick={() => setShowForm(true)}>+ Add Year</button>
      </div>
      <div className="page-content">
        {error && <p style={{ color: 'var(--clr-danger)', marginBottom: 12 }}>{error}</p>}
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={3} className="empty-state">Loading…</td></tr>
                ) : fiscalYears.length === 0 ? (
                  <tr><td colSpan={3} className="empty-state">No fiscal years yet.</td></tr>
                ) : fiscalYears.map(fy => (
                  <tr key={fy.year}>
                    <td style={{ fontWeight: 600 }}>{fy.year}</td>
                    <td>
                      <span className={`status-badge ${fy.status}`}>{fy.status}</span>
                    </td>
                    <td>
                      <button
                        className="secondary"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => setYear(fy.year)}
                        disabled={fy.year === selectedYear}
                      >
                        {fy.year === selectedYear ? 'Selected' : 'Select'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Add Fiscal Year</h3>
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div>
                  <label htmlFor="fy-year">Year</label>
                  <input
                    id="fy-year"
                    type="number"
                    value={newYear}
                    onChange={e => setNewYear(e.target.value)}
                    min={2020}
                    max={2040}
                    required
                  />
                </div>
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
