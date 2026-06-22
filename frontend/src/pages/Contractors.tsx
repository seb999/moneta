import { useEffect, useState } from 'react'
import {
  getContractors, createContractor, updateContractor, deleteContractor, setContractorProfile,
  discoverContractors, discoverContractorsByRef, bulkImportContractors,
  getRateCards, upsertRateCard, deleteRateCard, getPaymentRefs,
} from '../api/client'
import { eur } from '../api/format'
import { useYear } from '../contexts/YearContext'
import type { Contractor, DiscoveredUser, RateCard, PaymentRef } from '../api/types'

const COMPANIES = ['Tracasa', 'Altia', 'Other']

export default function Contractors() {
  const { year } = useYear()
  const [items, setItems] = useState<Contractor[]>([])
  const [rateCards, setRateCards] = useState<RateCard[]>([])
  const [paymentRefs, setPaymentRefs] = useState<PaymentRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Contractor add/edit modal
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Contractor | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [company, setCompany] = useState(COMPANIES[0])
  const [profile, setProfile] = useState('')
  const [taskmanUserId, setTaskmanUserId] = useState('')

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

  // Profiles available for a given company (from rate cards)
  const profilesFor = (comp: string) => rateCards.filter(rc => rc.company === comp).map(rc => rc.profile)

  // ── Rate cards ──────────────────────────────────────────────────────────
  async function handleSaveRateCard(e: React.FormEvent) {
    e.preventDefault()
    if (!rcProfile || !rcDaily) return
    try {
      await upsertRateCard({
        company: rcCompany, profile: rcProfile,
        dailyRateEur: Number(rcDaily),
        intraMurosRateEur: rcIntra ? Number(rcIntra) : null,
      })
      setRcProfile(''); setRcDaily(''); setRcIntra('')
      load()
    } catch (e) { setError(String(e)) }
  }
  async function handleDeleteRateCard(id: number) {
    if (!confirm('Delete this rate card?')) return
    try { await deleteRateCard(id); load() } catch (e) { setError(String(e)) }
  }

  // ── Discovery ───────────────────────────────────────────────────────────
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
      .map(u => ({
        taskmanUserId: u.taskmanUserId!, name: u.name,
        company: selCompany[u.taskmanUserId!] ?? COMPANIES[0],
        profile: selProfile[u.taskmanUserId!] || null,
      }))
    if (!toImport.length) return
    setImporting(true); setError(null)
    try {
      const count = await bulkImportContractors(toImport)
      setDiscovered([]); load()
      alert(`Imported ${count} contractor(s).`)
    } catch (e) { setError(String(e)) }
    finally { setImporting(false) }
  }

  // ── Contractor CRUD ─────────────────────────────────────────────────────
  function openForm(item?: Contractor) {
    setError(null); setEditItem(item ?? null)
    setName(item?.name ?? ''); setCompany(item?.company ?? COMPANIES[0])
    setProfile(item?.profile ?? ''); setTaskmanUserId(item?.taskmanUserId != null ? String(item.taskmanUserId) : '')
    setShowForm(true)
  }
  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null)
    const data = { name, company, profile: profile || null, taskmanUserId: taskmanUserId ? Number(taskmanUserId) : undefined }
    try {
      if (editItem) await updateContractor(editItem.id, data)
      else await createContractor(data)
      setShowForm(false); load()
    } catch (e) { setError(String(e)) }
    finally { setSaving(false) }
  }
  async function handleDelete(id: number) {
    if (!confirm('Delete this contractor?')) return
    try { await deleteContractor(id); load() } catch (e) { setError(String(e)) }
  }
  async function handleProfileChange(c: Contractor, p: string) {
    try { await setContractorProfile(c.id, p || null); load() } catch (e) { setError(String(e)) }
  }

  function rateForContractor(c: Contractor): RateCard | undefined {
    if (!c.profile) return undefined
    return rateCards.find(rc => rc.company === c.company && rc.profile === c.profile)
  }

  const newToImport = discovered.filter(u => !u.alreadyImported && u.taskmanUserId != null)
  const needReingest = discovered.filter(u => u.taskmanUserId == null)
  const companies = [...new Set(items.map(c => c.company))]
    .sort((a, b) => COMPANIES.indexOf(a) - COMPANIES.indexOf(b) || a.localeCompare(b))

  return (
    <>
      <div className="page-header">
        <h1>Contractors & Rates</h1>
        <button onClick={() => openForm()}>+ Add Manually</button>
      </div>
      <div className="page-content">
        {error && <p style={{ color: 'var(--clr-danger)', marginBottom: 12 }}>{error}</p>}

        {/* Rate cards */}
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

        {/* Discovery */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h2>Discover Developers</h2></div>
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
                  <label>Payment Ref (from ingested data)</label>
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
                  {discovered.length} developer(s) found — <strong style={{ color: 'var(--clr-green)' }}>{discovered.length - newToImport.length - needReingest.length} already saved</strong>
                  {newToImport.length > 0 && <>, <strong style={{ color: 'var(--clr-amber)' }}>{newToImport.length} new</strong></>}
                  {needReingest.length > 0 && <>, <strong style={{ color: 'var(--clr-danger)' }}>{needReingest.length} need re-ingest</strong></>}.
                  {needReingest.length > 0 && ' Rows without a Taskman ID were ingested before user IDs were tracked — run "Fetch from Taskman" for their period to make them importable.'}
                </p>
                <table>
                  <thead>
                    <tr><th>Name</th><th>Taskman ID</th><th>Company</th><th>Profile</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {discovered.map(u => {
                      const uid = u.taskmanUserId
                      const needsReingest = uid == null
                      return (
                      <tr key={uid ?? u.name} style={{ opacity: needsReingest ? 0.6 : 1 }}>
                        <td style={{ color: u.alreadyImported ? 'var(--clr-muted)' : 'inherit' }}>{u.name}</td>
                        <td>{uid != null ? <span className="code-badge">#{uid}</span> : <span className="text-muted text-sm">—</span>}</td>
                        <td>
                          {uid == null || u.alreadyImported ? <span className="text-muted text-sm">—</span> : (
                            <select value={selCompany[uid] ?? COMPANIES[0]}
                              onChange={e => setSelCompany(p => ({ ...p, [uid]: e.target.value }))} style={{ width: 130 }}>
                              {COMPANIES.map(c => <option key={c}>{c}</option>)}
                            </select>
                          )}
                        </td>
                        <td>
                          {uid == null || u.alreadyImported ? <span className="text-muted text-sm">—</span> : (
                            <select value={selProfile[uid] ?? ''}
                              onChange={e => setSelProfile(p => ({ ...p, [uid]: e.target.value }))} style={{ width: 100 }}>
                              <option value="">—</option>
                              {profilesFor(selCompany[uid] ?? COMPANIES[0]).map(p => <option key={p}>{p}</option>)}
                            </select>
                          )}
                        </td>
                        <td>
                          {needsReingest
                            ? <span style={{ color: 'var(--clr-danger)', fontSize: 12, fontWeight: 600 }}>needs re-ingest</span>
                            : u.alreadyImported
                            ? <span style={{ color: 'var(--clr-green)', fontSize: 12, fontWeight: 600 }}>✓ saved</span>
                            : <span style={{ color: 'var(--clr-amber)', fontSize: 12, fontWeight: 600 }}>new</span>}
                        </td>
                      </tr>
                    )})}
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

        {/* Contractor table grouped by company */}
        {loading ? <p className="text-muted">Loading…</p> : items.length === 0 ? (
          <div className="card"><div className="empty-state">No contractors yet — use Discover above.</div></div>
        ) : companies.map(comp => (
          <div key={comp} style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--clr-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{comp}</h2>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Name</th><th>Taskman ID</th><th>Profile</th><th className="num">Daily Rate</th><th></th></tr>
                  </thead>
                  <tbody>
                    {items.filter(c => c.company === comp).map(c => {
                      const card = rateForContractor(c)
                      const profiles = profilesFor(c.company)
                      return (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 500 }}>{c.name}</td>
                          <td>{c.taskmanUserId != null ? <span className="code-badge">#{c.taskmanUserId}</span> : <span style={{ fontSize: 11, color: 'var(--clr-danger)', fontWeight: 600 }}>⚠ missing</span>}</td>
                          <td>
                            <select value={c.profile ?? ''} onChange={e => handleProfileChange(c, e.target.value)} style={{ width: 110 }}>
                              <option value="">—</option>
                              {profiles.map(p => <option key={p}>{p}</option>)}
                            </select>
                          </td>
                          <td className="num">
                            {card ? <span className="eur">{eur(card.dailyRateEur)}</span>
                              : c.profile ? <span style={{ fontSize: 11, color: 'var(--clr-danger)' }}>no card for {c.company}/{c.profile}</span>
                              : <span style={{ fontSize: 11, color: 'var(--clr-amber)' }}>set profile →</span>}
                          </td>
                          <td>
                            <div className="flex-gap">
                              <button className="secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => openForm(c)}>Edit</button>
                              <button className="danger" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => handleDelete(c.id)}>Delete</button>
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
        ))}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editItem ? 'Edit' : 'Add'} Contractor</h3>
            {error && <p style={{ color: 'var(--clr-danger)', marginBottom: 12, fontSize: 13 }}>{error}</p>}
            <form onSubmit={handleSave}>
              <div className="form-row cols-2">
                <div><label>Name</label><input placeholder="e.g. John Doe" value={name} onChange={e => setName(e.target.value)} required /></div>
                <div>
                  <label>Company</label>
                  <select value={company} onChange={e => setCompany(e.target.value)}>{COMPANIES.map(c => <option key={c}>{c}</option>)}</select>
                </div>
              </div>
              <div className="form-row cols-2">
                <div>
                  <label>Profile</label>
                  <select value={profile} onChange={e => setProfile(e.target.value)}>
                    <option value="">—</option>
                    {profilesFor(company).map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label>Taskman User ID</label>
                  <input type="number" placeholder="e.g. 42" value={taskmanUserId} onChange={e => setTaskmanUserId(e.target.value)} />
                </div>
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
