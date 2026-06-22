import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getFiscalYears } from '../api/client'
import { useYear } from '../contexts/YearContext'

export default function Layout() {
  const { year, setYear } = useYear()
  const [years, setYears] = useState<number[]>([])

  useEffect(() => {
    getFiscalYears().then(fys => setYears(fys.map(f => f.year))).catch(() => {})
  }, [])

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          Moneta
          <span>EEA Budget Management</span>
        </div>
        <nav>
          <NavLink to="/" end className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            Budget Overview
          </NavLink>
          <NavLink to="/payment-refs" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            Payment Refs
          </NavLink>
          <NavLink to="/appropriations" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            Appropriations
          </NavLink>
          <NavLink to="/commitments" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            Commitments
          </NavLink>
          <NavLink to="/actuals" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            Actuals
          </NavLink>
          <NavLink to="/ingestion" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            Taskman Ingestion
          </NavLink>
          <NavLink to="/work-effort" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            Work Effort
          </NavLink>
          <NavLink to="/contractors" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            Contractors & Rates
          </NavLink>
          <NavLink to="/fiscal-years" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            Fiscal Years
          </NavLink>
        </nav>
        <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid var(--clr-border)' }}>
          <label htmlFor="year-select" style={{ marginBottom: 4 }}>Fiscal Year</label>
          <select id="year-select" value={year} onChange={e => setYear(Number(e.target.value))}>
            {years.length === 0 && <option value={year}>{year}</option>}
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
