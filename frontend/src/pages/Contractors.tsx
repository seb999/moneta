import { useEffect, useState } from 'react'
import {
  getContractors, createContractor, updateContractor, deleteContractor,
  discoverContractors, discoverContractorsByRef, bulkImportContractors,
  getRateCards, upsertRateCard, deleteRateCard, getPaymentRefs,
} from '../api/client'
import { eur } from '../api/format'
import { useYear } from '../contexts/YearContext'
import type { Contractor, DiscoveredUser, RateCard, PaymentRef } from '../api/types'

const COMPANIES = ['Tracasa', 'Altia', 'Bilbomatica', 'Other']

export default function Contractors() {
  const { year } = useYear()
  const [items, setItems] = useState<Contractor[]>([])
  const [rateCards, setRateCards] = useState<RateCard[]>([])
  const [paymentRefs, setPaymentRefs] = useState<PaymentRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Inline name editing (other fields save immediately on change)
  const [editingNames, setEditingNames] = useState<Record<number, string>>({})

  // Add row
  const [addingRow, setAddingRow] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCompany, setNewCompany] = useState(COMPANIES[0])
  const [newProfile, setNewProfile] = useState('')
  const [newTaskmanId, setNewTaskmanId] = useState('')
  const [addingSaving, setAddingSaving] = useState(false)

  // Rate card form
  const [rcCompany, setRcCompany] = useState(COMPANIES[0])
  const [rcProfile, setRcProfile] = useState('')
  const [rcDaily, setRcDaily] = useState('')
  const [rcIntra, setRcIntra] = useState('')

  // Discovery
  const [discoverMode, setDiscoverMode] = useState<'ref' | 'project'>('ref')
  const [discoverProjectId, setDiscoverProjectId] = useState('176')
  const [discoverRefId, setDiscoverRefId] = useState<number | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const [discovered, setDiscovered] = useState<DiscoveredUser[]>([])
  const [selCompany, setSelCompany] = useState<Record<number, string>>({})
  const [selProfile, setSelProfile] = useState<Record<number, string>>({})
  const [importing, setImporting] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([getContractors(), getRateCards()])
      .then(([cs, rcs]) => { setItems(cs); setRateCards(rcs) })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    getPaymentRefs(year).then(refs => {
      setPaymentRefs(refs)
      if (refs.length > 0) setDiscoverRefId(refs[0].id)
    }).catch(() => {})
  }, [year])

  const profilesFor = (comp: string) => rateCards.filter(rc => rc.company === comp).map(rc => rc.profile)
  const rateFor = (c: Contractor) =>
    c.profile ? rateCards.find(rc => rc.company === c.company && rc.profile === c.profile) : undefined

  // ── Inline contractor editing ────────────────────────────────────────────────

  const tid = (c: Contractor) => c.taskmanUserId ?? undefined

  async function handleNameBlur(c: Contractor) {
    const newVal = editingNames[c.id]
    setEditingNames(p => { const n = { ...p }; delete n[c.id]; return n })
    if (!newVal || newVal === c.name) return
    try {
      await updateContractor(c.id, { name: newVal, company: c.company, profile: c.profile, taskmanUserId: tid(c) })
      load()
    } catch (e) { setError(String(e)) }
  }

  async function handleCompanyChange(c: Contractor, company: string) {
    try {
      await updateContractor(c.id, { name: c.name, company, profile: c.profile, taskmanUserId: tid(c) })
      load()
    } catch (e) { setError(String(e)) }
  }

  async function handleProfileChange(c: Contractor, profile: string) {
    try {
      await updateContractor(c.id, { name: c.name, company: c.company, profile: profile || null, taskmanUserId: tid(c) })
      load()
    } catch (e) { setError(String(e)) }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this contractor?')) return
    try { await deleteContractor(id); load() } catch (e) { setError(String(e)) }
  }

  async function handleAddSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setAddingSaving(true); setError(null)
    try {
      await createContractor({ name: newName, company: newCompany, profile: newProfile || null, taskmanUserId: newTaskmanId ? Number(newTaskmanId) : undefined })
      setAddingRow(false); setNewName(''); setNewCompany(COMPANIES[0]); setNewProfile(''); setNewTaskmanId('')
      load()
    } catch (e) { setError(String(e)) }
    finally { setAddingSaving(false) }
  }

  // ── Rate cards ───────────────────────────────────────────────────────────────

  async function handleSaveRateCard(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!rcProfile || !rcDaily) return
    try {
      await upsertRateCard({ company: rcCompany, profile: rcProfile, dailyRateEur: Number(rcDaily), intraMurosRateEur: rcIntra ? Number(rcIntra) : null })
      setRcProfile(''); setRcDaily(''); setRcIntra('')
      load()
    } catch (e) { setError(String(e)) }
  }

  async function handleDeleteRateCard(id: number) {
    if (!confirm('Delete this rate card?')) return
    try { await deleteRateCard(id); load() } catch (e) { setError(String(e)) }
  }

  // ── Discovery ────────────────────────────────────────────────────────────────

  async function handleDiscover() {
    setDiscovering(true); setError(null); setDiscovered([])
    try {
      const users = discoverMode === 'ref'
        ? await discoverContractorsByRef(discoverRefId!)
        : await discoverContractors(Number(discoverProjectId), 12)
      setDiscovered(users)
      const dc: Record<number, string> = {}, dp: Record<number, string> = {}
      users.forEach(u => { if (u.taskmanUserId != null) { dc[u.taskmanUserId] = COMPANIES[0]; dp[u.taskmanUserId] = '' } })
      setSelCompany(dc); setSelProfile(dp)
    } catch (e) { setError(String(e)) }
    finally { setDiscovering(false) }
  }

  async function handleBulkImport() {
    const toImport = discovered
      .filter(u => !u.alreadyImported && u.taskmanUserId != null)
      .map(u => ({ taskmanUserId: u.taskmanUserId!, name: u.name, company: selCompany[u.taskmanUserId!] ?? COMPANIES[0], profile: selProfile[u.taskmanUserId!] || null }))
    if (!toImport.length) return
    setImporting(true); setError(null)
    try {
      const count = await bulkImportContractors(toImport)
      setDiscovered([]); load()
      alert(`Imported ${count} contractor(s).`)
    } catch (e) { setError(String(e)) }
    finally { setImporting(false) }
  }

  const newToImport = discovered.filter(u => !u.alreadyImported && u.taskmanUserId != null)
  const needReingest = discovered.filter(u => u.taskmanUserId == null)
  const sorted = [...items].sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name))

  return (
    <>
      <div className="page-header">
        <h1>Contractors & Rates</h1>
        {!addingRow && <button onClick={() => setAddingRow(true)}>+ Add Manually</button>}
      </div>
      <div className="page-content">
        {error && <p style={{ color: 'var(--clr-danger)', marginBottom: 12 }}>{error}</p>}

        {/* ── Discover Developers from Taskman ────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h2>Discover Developers from Taskman</h2></div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: discovered.length ? 16 : 0 }}>
              <div>
                <label>Source</label>
                <div style={{ display: 'flex', border: '1px solid var(--clr-border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  {(['ref', 'project'] as const).map(m => (
                    <button key={m} onClick={() => setDiscoverMode(m)} type="button" style={{
                      borderRadius: 0, background: discoverMode === m ? 'var(--clr-primary)' : 'transparent',
                      color: discoverMode === m ? '#fff' : 'var(--clr-text)', padding: '5px 14px', fontSize: 13,
                    }}>{m === 'ref' ? 'Payment Ref' : 'Project (live)'}</button>
                  ))}
                </div>
              </div>
              {discoverMode === 'ref' ? (
                <div style={{ flex: '0 0 460px' }}>
                  <label>Payment Ref</label>
                  <select value={discoverRefId ?? ''} onChange={e => setDiscoverRefId(Number(e.target.value))}>
                    {paymentRefs.length === 0 && <option value="">— no refs —</option>}
                    {paymentRefs.map(r => <option key={r.id} value={r.id}>{r.paymentRefId}</option>)}
                  </select>
                </div>
              ) : (
                <div style={{ flex: '0 0 200px' }}>
                  <label>Redmine Project ID</label>
                  <input type="number" value={discoverProjectId} onChange={e => setDiscoverProjectId(e.target.value)} placeholder="e.g. 176" />
                </div>
              )}
              <button onClick={handleDiscover} disabled={discovering || (discoverMode === 'ref' ? !discoverRefId : !discoverProjectId)}>
                {discovering ? 'Scanning…' : 'Scan'}
              </button>
            </div>

            {discovered.length > 0 && (
              <>
                <p className="text-muted text-sm" style={{ marginBottom: 8 }}>
                  {discovered.length} developer(s) found —{' '}
                  <strong style={{ color: 'var(--clr-green)' }}>{discovered.length - newToImport.length - needReingest.length} already saved</strong>
                  {newToImport.length > 0 && <>, <strong style={{ color: 'var(--clr-amber)' }}>{newToImport.length} new</strong></>}
                  {needReingest.length > 0 && <>, <strong style={{ color: 'var(--clr-danger)' }}>{needReingest.length} need re-ingest</strong></>}.
                </p>
                <table>
                  <thead>
                    <tr><th>Name</th><th>Taskman ID</th><th>Company</th><th>Profile</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {discovered.map(u => {
                      const uid = u.taskmanUserId
                      return (
                        <tr key={uid ?? u.name} style={{ opacity: uid == null ? 0.6 : 1 }}>
                          <td style={{ color: u.alreadyImported ? 'var(--clr-muted)' : 'inherit' }}>{u.name}</td>
                          <td>{uid != null ? <span className="code-badge">#{uid}</span> : <span className="text-muted text-sm">—</span>}</td>
                          <td>
                            {uid == null || u.alreadyImported ? <span className="text-muted text-sm">—</span> : (
                              <select value={selCompany[uid] ?? COMPANIES[0]} onChange={e => setSelCompany(p => ({ ...p, [uid]: e.target.value }))} style={{ width: 130 }}>
                                {COMPANIES.map(c => <option key={c}>{c}</option>)}
                              </select>
                            )}
                          </td>
                          <td>
                            {uid == null || u.alreadyImported ? <span className="text-muted text-sm">—</span> : (
                              <select value={selProfile[uid] ?? ''} onChange={e => setSelProfile(p => ({ ...p, [uid]: e.target.value }))} style={{ width: 100 }}>
                                <option value="">—</option>
                                {profilesFor(selCompany[uid] ?? COMPANIES[0]).map(p => <option key={p}>{p}</option>)}
                              </select>
                            )}
                          </td>
                          <td>
                            {uid == null
                              ? <span style={{ color: 'var(--clr-danger)', fontSize: 12, fontWeight: 600 }}>needs re-ingest</span>
                              : u.alreadyImported
                              ? <span style={{ color: 'var(--clr-green)', fontSize: 12, fontWeight: 600 }}>✓ saved</span>
                              : <span style={{ color: 'var(--clr-amber)', fontSize: 12, fontWeight: 600 }}>new</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {newToImport.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <button onClick={handleBulkImport} disabled={importing}>
                      {importing ? 'Saving…' : `Save ${newToImport.length} developer(s)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Rate cards ───────────────────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h2>Rate Cards <span className="text-muted text-sm" style={{ fontWeight: 400 }}>(daily rate per company × profile)</span></h2></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th><th>Profile</th>
                  <th className="num">Extra-muros €/day</th>
                  <th className="num">Intra-muros €/day</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rateCards.length === 0 ? (
                  <tr><td colSpan={5} className="empty-state">No rate cards yet — add one below.</td></tr>
                ) : rateCards.map(rc => (
                  <tr key={rc.id}>
                    <td>{rc.company}</td>
                    <td><span className="code-badge">{rc.profile}</span></td>
                    <td className="num"><span className="eur">{eur(rc.dailyRateEur)}</span></td>
                    <td className="num">{rc.intraMurosRateEur != null ? <span className="eur">{eur(rc.intraMurosRateEur)}</span> : <span className="text-muted">—</span>}</td>
                    <td><button className="danger" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => handleDeleteRateCard(rc.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--clr-border)', background: 'var(--clr-bg)' }}>
            <form onSubmit={handleSaveRateCard} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
              <div>
                <label>Company</label>
                <select value={rcCompany} onChange={e => setRcCompany(e.target.value)}>{COMPANIES.map(c => <option key={c}>{c}</option>)}</select>
              </div>
              <div><label>Profile</label><input placeholder="e.g. P1" value={rcProfile} onChange={e => setRcProfile(e.target.value)} required /></div>
              <div><label>Extra-muros €/day</label><input type="number" step="0.01" min="0" placeholder="0.00" value={rcDaily} onChange={e => setRcDaily(e.target.value)} required /></div>
              <div><label>Intra-muros €/day</label><input type="number" step="0.01" min="0" placeholder="optional" value={rcIntra} onChange={e => setRcIntra(e.target.value)} /></div>
              <button type="submit">Save Card</button>
            </form>
          </div>
        </div>

        {/* ── Developers list ─────────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header"><h2>Developers</h2></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Profile</th>
                  <th className="num">Daily Rate (€)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="empty-state">Loading…</td></tr>
                ) : sorted.length === 0 && !addingRow ? (
                  <tr><td colSpan={5} className="empty-state">No contractors yet — use Discover below or click "+ Add Manually".</td></tr>
                ) : sorted.map(c => {
                  const card = rateFor(c)
                  const profiles = profilesFor(c.company)
                  return (
                    <tr key={c.id}>
                      <td>
                        <input
                          style={{ width: '100%', minWidth: 140 }}
                          value={editingNames[c.id] ?? c.name}
                          onChange={e => setEditingNames(p => ({ ...p, [c.id]: e.target.value }))}
                          onBlur={() => handleNameBlur(c)}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        />
                      </td>
                      <td>
                        <select value={c.company} onChange={e => handleCompanyChange(c, e.target.value)} style={{ width: 120 }}>
                          {COMPANIES.map(co => <option key={co}>{co}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={c.profile ?? ''} onChange={e => handleProfileChange(c, e.target.value)} style={{ width: 100 }}>
                          <option value="">—</option>
                          {profiles.map(p => <option key={p}>{p}</option>)}
                        </select>
                      </td>
                      <td className="num">
                        {card
                          ? <span className="eur">{eur(card.dailyRateEur)}</span>
                          : c.profile
                          ? <span style={{ fontSize: 11, color: 'var(--clr-danger)' }}>no card for {c.company}/{c.profile}</span>
                          : <span className="text-muted text-sm">set profile →</span>}
                      </td>
                      <td>
                        <button className="danger" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => handleDelete(c.id)}>Delete</button>
                      </td>
                    </tr>
                  )
                })}

                {/* Inline add row */}
                {addingRow && (
                  <tr>
                    <td colSpan={5} style={{ padding: 0 }}>
                      <form onSubmit={handleAddSave} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 110px 130px auto auto', gap: 6, padding: '8px 12px', background: 'var(--clr-bg-soft, #f8fafc)' }}>
                        <input placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} required autoFocus />
                        <select value={newCompany} onChange={e => setNewCompany(e.target.value)}>
                          {COMPANIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                        <select value={newProfile} onChange={e => setNewProfile(e.target.value)}>
                          <option value="">— profile —</option>
                          {profilesFor(newCompany).map(p => <option key={p}>{p}</option>)}
                        </select>
                        <input type="number" placeholder="Taskman user ID" value={newTaskmanId} onChange={e => setNewTaskmanId(e.target.value)} />
                        <button type="submit" disabled={addingSaving}>{addingSaving ? 'Saving…' : 'Save'}</button>
                        <button type="button" className="secondary" onClick={() => setAddingRow(false)}>Cancel</button>
                      </form>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </>
  )
}
