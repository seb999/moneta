import { useEffect, useState } from 'react'
import { getCompanies, createCompany, deleteCompany, getRateCards, upsertRateCard, deleteRateCard } from '../api/client'
import { eur } from '../api/format'
import type { Company, RateCard } from '../api/types'
import BinButton from '../components/BinButton'

export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [rateCards, setRateCards] = useState<RateCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add company form
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [addingSaving, setAddingSaving] = useState(false)

  // Add rate form — one at a time, keyed by company id
  const [addingRateFor, setAddingRateFor] = useState<number | null>(null)
  const [rcProfile, setRcProfile] = useState('')
  const [rcDaily, setRcDaily] = useState('')
  const [rcIntra, setRcIntra] = useState('')
  const [rateSaving, setRateSaving] = useState(false)

  // Edit rate form — keyed by rate card id
  const [editingRateId, setEditingRateId] = useState<number | null>(null)
  const [editProfile, setEditProfile] = useState('')
  const [editDaily, setEditDaily] = useState('')
  const [editIntra, setEditIntra] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([getCompanies(), getRateCards()])
      .then(([cs, rcs]) => { setCompanies(cs); setRateCards(rcs) })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleAddCompany(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setAddingSaving(true); setError(null)
    try {
      await createCompany(newName.trim())
      setNewName(''); setShowForm(false)
      load()
    } catch (e) { setError(String(e)) }
    finally { setAddingSaving(false) }
  }

  async function handleDeleteCompany(id: number, name: string) {
    if (!confirm(`Delete "${name}"? Rate cards for this company will also be deleted.`)) return
    try {
      const cards = rateCards.filter(rc => rc.company === name)
      await Promise.all(cards.map(rc => deleteRateCard(rc.id)))
      await deleteCompany(id)
      load()
    } catch (e) { setError(String(e)) }
  }

  function openAddRate(companyId: number) {
    setEditingRateId(null)
    setAddingRateFor(companyId)
    setRcProfile(''); setRcDaily(''); setRcIntra('')
  }

  function openEditRate(rc: RateCard) {
    setAddingRateFor(null)
    setEditingRateId(rc.id)
    setEditProfile(rc.profile)
    setEditDaily(String(rc.dailyRateEur))
    setEditIntra(rc.intraMurosRateEur != null ? String(rc.intraMurosRateEur) : '')
  }

  async function handleUpdateRate(e: React.FormEvent, rc: RateCard) {
    e.preventDefault()
    setEditSaving(true); setError(null)
    try {
      if (editProfile !== rc.profile) await deleteRateCard(rc.id)
      await upsertRateCard({ company: rc.company, profile: editProfile, dailyRateEur: Number(editDaily), intraMurosRateEur: editIntra ? Number(editIntra) : null })
      setEditingRateId(null)
      load()
    } catch (e) { setError(String(e)) }
    finally { setEditSaving(false) }
  }

  async function handleSaveRate(e: React.FormEvent, companyName: string) {
    e.preventDefault()
    if (!rcProfile || !rcDaily) return
    setRateSaving(true); setError(null)
    try {
      await upsertRateCard({ company: companyName, profile: rcProfile, dailyRateEur: Number(rcDaily), intraMurosRateEur: rcIntra ? Number(rcIntra) : null })
      setAddingRateFor(null)
      load()
    } catch (e) { setError(String(e)) }
    finally { setRateSaving(false) }
  }

  async function handleDeleteRate(id: number) {
    if (!confirm('Delete this rate card?')) return
    try { await deleteRateCard(id); load() }
    catch (e) { setError(String(e)) }
  }

  return (
    <>
      <div className="page-header">
        <h1>Companies</h1>
        {!showForm && <button onClick={() => setShowForm(true)}>+ Add Company</button>}
      </div>
      <div className="page-content">
        {error && <p style={{ color: 'var(--clr-danger)', marginBottom: 12 }}>{error}</p>}

        {showForm && (
          <div className="card" style={{ marginBottom: 16 }}>
            <form onSubmit={handleAddCompany} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: '12px 16px' }}>
              <div style={{ flex: 1 }}>
                <label>Company name</label>
                <input placeholder="e.g. Acme Consulting" value={newName} onChange={e => setNewName(e.target.value)} required autoFocus />
              </div>
              <button type="submit" disabled={addingSaving}>{addingSaving ? 'Saving…' : 'Save'}</button>
              <button type="button" className="secondary" onClick={() => { setShowForm(false); setNewName('') }}>Cancel</button>
            </form>
          </div>
        )}

        {loading ? (
          <div className="card"><div className="table-wrap"><table><tbody><tr><td className="empty-state">Loading…</td></tr></tbody></table></div></div>
        ) : companies.length === 0 ? (
          <div className="card"><div className="table-wrap"><table><tbody><tr><td className="empty-state">No companies yet — click "+ Add Company" to get started.</td></tr></tbody></table></div></div>
        ) : companies.map(company => {
          const cards = rateCards.filter(rc => rc.company === company.name)
          return (
            <div key={company.id} className="card" style={{ marginBottom: 16 }}>
              <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0 }}>{company.name}</h2>
                <BinButton onClick={() => handleDeleteCompany(company.id, company.name)} title="Delete company" />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Profile</th>
                      <th className="num">Extra-muros €/day</th>
                      <th className="num">Intra-muros €/day</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cards.length === 0 && addingRateFor !== company.id && (
                      <tr><td colSpan={4} className="empty-state">No rate cards — add one below.</td></tr>
                    )}
                    {cards.map(rc => editingRateId === rc.id ? (
                      <tr key={rc.id}>
                        <td colSpan={4} style={{ padding: 0 }}>
                          <form onSubmit={e => handleUpdateRate(e, rc)} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr auto auto', gap: 8, padding: '8px 12px', background: 'var(--clr-bg-soft, #f8fafc)' }}>
                            <input placeholder="Profile" value={editProfile} onChange={e => setEditProfile(e.target.value)} required autoFocus />
                            <input type="number" step="0.01" min="0" placeholder="Extra-muros €/day" value={editDaily} onChange={e => setEditDaily(e.target.value)} required />
                            <input type="number" step="0.01" min="0" placeholder="Intra-muros (opt.)" value={editIntra} onChange={e => setEditIntra(e.target.value)} />
                            <button type="submit" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save'}</button>
                            <button type="button" className="secondary" onClick={() => setEditingRateId(null)}>Cancel</button>
                          </form>
                        </td>
                      </tr>
                    ) : (
                      <tr key={rc.id}>
                        <td><span className="code-badge">{rc.profile}</span></td>
                        <td className="num"><span className="eur">{eur(rc.dailyRateEur)}</span></td>
                        <td className="num">{rc.intraMurosRateEur != null ? <span className="eur">{eur(rc.intraMurosRateEur)}</span> : <span className="text-muted">—</span>}</td>
                        <td style={{ display: 'flex', gap: 4 }}>
                          <button className="secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => openEditRate(rc)}>Edit</button>
                          <BinButton onClick={() => handleDeleteRate(rc.id)} title="Delete rate" />
                        </td>
                      </tr>
                    ))}
                    {addingRateFor === company.id ? (
                      <tr>
                        <td colSpan={4} style={{ padding: 0 }}>
                          <form onSubmit={e => handleSaveRate(e, company.name)} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr auto auto', gap: 8, padding: '8px 12px', background: 'var(--clr-bg-soft, #f8fafc)' }}>
                            <input placeholder="Profile (e.g. P1)" value={rcProfile} onChange={e => setRcProfile(e.target.value)} required autoFocus />
                            <input type="number" step="0.01" min="0" placeholder="Extra-muros €/day" value={rcDaily} onChange={e => setRcDaily(e.target.value)} required />
                            <input type="number" step="0.01" min="0" placeholder="Intra-muros (opt.)" value={rcIntra} onChange={e => setRcIntra(e.target.value)} />
                            <button type="submit" disabled={rateSaving}>{rateSaving ? 'Saving…' : 'Save'}</button>
                            <button type="button" className="secondary" onClick={() => setAddingRateFor(null)}>Cancel</button>
                          </form>
                        </td>
                      </tr>
                    ) : (
                      <tr>
                        <td colSpan={4} style={{ padding: '6px 12px', background: 'var(--clr-bg-soft, #f8fafc)' }}>
                          <button className="secondary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => openAddRate(company.id)}>+ Add Rate</button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}

      </div>
    </>
  )
}
