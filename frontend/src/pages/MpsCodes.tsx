import { useEffect, useRef, useState } from 'react'
import { getMpsCodes, getMpsMappings, getMpsUnmapped, importMpsBundled, importMpsFile, createMpsMapping, updateMpsMapping, deleteMpsMapping } from '../api/client'
import { useYear } from '../contexts/YearContext'
import type { MpsCode, CategoryMpsMap, MpsImportResult, UnmappedPair } from '../api/types'

export default function MpsCodes() {
  const { year } = useYear()
  const [tab, setTab] = useState<'codes' | 'mappings' | 'unmapped'>('mappings')
  const [codes, setCodes] = useState<MpsCode[]>([])
  const [mappings, setMappings] = useState<CategoryMpsMap[]>([])
  const [unmapped, setUnmapped] = useState<UnmappedPair[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<MpsImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Mapping editor
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<CategoryMpsMap | null>(null)
  const [saving, setSaving] = useState(false)
  const [fProject, setFProject] = useState('')
  const [fCategory, setFCategory] = useState('')
  const [fCode, setFCode] = useState('')
  const [fExcluded, setFExcluded] = useState(false)
  const [fNote, setFNote] = useState('')

  function openForm(item?: CategoryMpsMap, prefill?: { project: string; category: string }) {
    setError(null); setEditItem(item ?? null)
    setFProject(item?.taskmanProject ?? prefill?.project ?? '')
    setFCategory(item?.taskmanCategory ?? prefill?.category ?? '')
    setFCode(item?.mpsCode ?? '')
    setFExcluded(item?.excluded ?? false)
    setFNote(item?.note ?? '')
    setShowForm(true)
  }

  async function handleSaveMapping(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null)
    const data = {
      fiscalYear: year,
      taskmanProject: fProject.trim(),
      taskmanCategory: fCategory.trim() || null,
      mpsCode: fExcluded ? null : (fCode.trim() || null),
      excluded: fExcluded,
      note: fNote.trim() || null,
    }
    try {
      if (editItem) await updateMpsMapping(editItem.id, data)
      else await createMpsMapping(data)
      setShowForm(false); load()
    } catch (e) { setError(String(e)) }
    finally { setSaving(false) }
  }

  async function handleDeleteMapping(id: number) {
    try { await deleteMpsMapping(id); load() }
    catch (e) { setError(String(e)) }
  }

  function load() {
    setLoading(true)
    Promise.all([getMpsCodes(year), getMpsMappings(year), getMpsUnmapped(year)])
      .then(([c, m, u]) => { setCodes(c); setMappings(m); setUnmapped(u) })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [year])

  async function handleImportBundled() {
    if (!confirm(`Import the 2026 MPS codes & mapping from the bundled Excel? This replaces existing ${year} MPS data.`)) return
    setImporting(true); setError(null); setResult(null)
    try { setResult(await importMpsBundled(year)); load() }
    catch (e) { setError(String(e)) }
    finally { setImporting(false) }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true); setError(null); setResult(null)
    try { setResult(await importMpsFile(year, file)); load() }
    catch (e) { setError(String(e)) }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const STATUS_COLOR: Record<string, string> = { mapped: '#16a34a', excluded: '#94a3b8' }
  const filteredMappings = mappings.filter(m =>
    !filter ||
    m.taskmanProject.toLowerCase().includes(filter.toLowerCase()) ||
    m.taskmanCategory.toLowerCase().includes(filter.toLowerCase()) ||
    (m.mpsCode ?? '').includes(filter))

  return (
    <>
      <div className="page-header">
        <h1>MPS Codes — {year}</h1>
        <div className="flex-gap">
          <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleFile} />
          <button className="secondary" onClick={() => fileRef.current?.click()} disabled={importing}>Upload xlsx…</button>
          <button onClick={handleImportBundled} disabled={importing}>
            {importing ? 'Importing…' : 'Import bundled Excel'}
          </button>
        </div>
      </div>
      <div className="page-content">
        <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
          MPS codes and the <strong>(Taskman Project, Category) → MPS</strong> mapping, used to split invoices.
          Seeded from the Altia workbook; a Management-Plan source comes later.
        </p>
        {error && <p style={{ color: 'var(--clr-danger)', marginBottom: 12 }}>{error}</p>}
        {result && (
          <div className="card" style={{ marginBottom: 16, borderColor: 'var(--clr-green)' }}>
            <div className="card-body">
              <p style={{ fontSize: 13 }}>
                ✓ Imported for {result.fiscalYear}: <strong>{result.mpsCodes}</strong> MPS codes,{' '}
                <strong>{result.mappings}</strong> mappings, <strong>{result.excluded}</strong> excluded.
              </p>
              {result.warnings.length > 0 && (
                <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 12, color: 'var(--clr-muted)' }}>
                  {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 12, border: '1px solid var(--clr-border)', borderRadius: 'var(--radius)', width: 'fit-content', overflow: 'hidden' }}>
          {(['mappings', 'codes', 'unmapped'] as const).map(t => (
            <button key={t} className={tab === t ? '' : 'secondary'} style={{ borderRadius: 0 }} onClick={() => setTab(t)}>
              {t === 'mappings' ? `Category Mapping (${mappings.length})`
                : t === 'codes' ? `MPS Codes (${codes.length})`
                : `Unmapped (${unmapped.length})`}
            </button>
          ))}
        </div>

        {loading ? <p className="text-muted">Loading…</p> : tab === 'unmapped' ? (
          <div className="card">
            <div className="card-header">
              <h2>Unmapped (Project, Category)</h2>
              <span className="text-muted text-sm">From ingested cost data — add a rule to resolve each, then re-ingest.</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Taskman Project</th><th>Category</th><th className="num">Hours</th><th className="num">Entries</th><th></th></tr></thead>
                <tbody>
                  {unmapped.length === 0 ? (
                    <tr><td colSpan={5} className="empty-state">No unmapped entries 🎉 (or none ingested yet for {year}).</td></tr>
                  ) : unmapped.map((u, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{u.taskmanProject}</td>
                      <td className="text-muted text-sm">{u.taskmanCategory || <em>blank (no category)</em>}</td>
                      <td className="num">{u.hours.toFixed(1)}</td>
                      <td className="num text-muted">{u.entries}</td>
                      <td>
                        <button style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => openForm(undefined, { project: u.taskmanProject, category: u.taskmanCategory })}>
                          Map →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : tab === 'codes' ? (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>MPS Code</th><th>Rollup</th><th>Label</th></tr></thead>
                <tbody>
                  {codes.length === 0 ? (
                    <tr><td colSpan={3} className="empty-state">No MPS codes for {year}. Import to seed.</td></tr>
                  ) : codes.map(c => (
                    <tr key={c.id}>
                      <td><span className="code-badge">{c.code}</span></td>
                      <td className="text-muted text-sm">{c.rollup ?? '—'}</td>
                      <td className="text-sm">{c.label ?? <span className="text-muted">— (not yet sourced)</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-header">
              <h2>Category → MPS</h2>
              <div className="flex-gap">
                <input style={{ width: 240 }} placeholder="Filter project / category / code…" value={filter} onChange={e => setFilter(e.target.value)} />
                <button onClick={() => openForm()}>+ Add mapping</button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Taskman Project</th><th>Category</th><th>→ MPS</th><th>Status</th><th>Note</th><th></th></tr></thead>
                <tbody>
                  {filteredMappings.length === 0 ? (
                    <tr><td colSpan={6} className="empty-state">No mappings for {year}. Import to seed, or add one.</td></tr>
                  ) : filteredMappings.map(m => (
                    <tr key={m.id} style={{ opacity: m.excluded ? 0.6 : 1 }}>
                      <td style={{ fontWeight: 500 }}>{m.taskmanProject}</td>
                      <td className="text-muted text-sm">{m.taskmanCategory || <em>any / blank (project default)</em>}</td>
                      <td>{m.mpsCode ? <span className="code-badge">{m.mpsCode}</span> : <span className="text-muted">—</span>}</td>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 600, color: m.excluded ? STATUS_COLOR.excluded : STATUS_COLOR.mapped }}>
                          {m.excluded ? 'excluded' : 'mapped'}
                        </span>
                      </td>
                      <td className="text-sm text-muted">{m.note ?? '—'}</td>
                      <td>
                        <div className="flex-gap">
                          <button className="secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => openForm(m)}>Edit</button>
                          <button className="danger" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => handleDeleteMapping(m.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <h3>{editItem ? 'Edit' : 'Add'} Mapping — {year}</h3>
            {error && <p style={{ color: 'var(--clr-danger)', marginBottom: 12, fontSize: 13 }}>{error}</p>}
            <form onSubmit={handleSaveMapping}>
              <div className="form-row cols-2">
                <div>
                  <label>Taskman Project</label>
                  <input value={fProject} onChange={e => setFProject(e.target.value)} placeholder="e.g. Natura2000" required />
                </div>
                <div>
                  <label>Category</label>
                  <input value={fCategory} onChange={e => setFCategory(e.target.value)} placeholder="blank = project default (no category)" />
                </div>
              </div>
              <p className="text-muted text-sm" style={{ marginTop: -4, marginBottom: 12 }}>
                Leave Category <strong>blank</strong> to map every entry of this project that has no category (or no other rule).
              </p>
              <div className="form-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input id="excl" type="checkbox" checked={fExcluded} onChange={e => setFExcluded(e.target.checked)} style={{ width: 'auto' }} />
                  <label htmlFor="excl" style={{ margin: 0 }}>Exclude from MPS (x — don't count)</label>
                </div>
              </div>
              {!fExcluded && (
                <div className="form-row">
                  <div>
                    <label>MPS Code</label>
                    <input list="mps-code-list" value={fCode} onChange={e => setFCode(e.target.value)} placeholder="e.g. 1.1.0" required={!fExcluded} />
                    <datalist id="mps-code-list">
                      {codes.map(c => <option key={c.id} value={c.code} />)}
                    </datalist>
                  </div>
                </div>
              )}
              <div className="form-row">
                <div><label>Note (optional)</label><input value={fNote} onChange={e => setFNote(e.target.value)} placeholder="e.g. Tracasa - use 6.4.2" /></div>
              </div>
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" disabled={saving}>{saving ? 'Saving…' : editItem ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
