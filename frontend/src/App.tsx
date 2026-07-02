import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { YearProvider } from './contexts/YearContext'
import AuthGate from './components/AuthGate'
import Layout from './components/Layout'
import BudgetOverview from './pages/BudgetOverview'
import PaymentRefs from './pages/PaymentRefs'
import Appropriations from './pages/Appropriations'
import Commitments from './pages/Commitments'
import Actuals from './pages/Actuals'
import Invoices from './pages/Invoices'
import Ingestion from './pages/Ingestion'
import WorkEffort from './pages/WorkEffort'
import Contractors from './pages/Contractors'
import Companies from './pages/Companies'
import MpsCodes from './pages/MpsCodes'
import FiscalYears from './pages/FiscalYears'

export default function App() {
  return (
    <AuthGate>
      <YearProvider>
        <BrowserRouter>
          <Routes>
          <Route element={<Layout />}>
            <Route index element={<BudgetOverview />} />
            <Route path="payment-refs" element={<PaymentRefs />} />
            <Route path="appropriations" element={<Appropriations />} />
            <Route path="commitments" element={<Commitments />} />
            <Route path="actuals" element={<Actuals />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="ingestion" element={<Ingestion />} />
            <Route path="work-effort" element={<WorkEffort />} />
            <Route path="contractors" element={<Contractors />} />
            <Route path="companies" element={<Companies />} />
            <Route path="mps-codes" element={<MpsCodes />} />
            <Route path="fiscal-years" element={<FiscalYears />} />
          </Route>
          </Routes>
        </BrowserRouter>
      </YearProvider>
    </AuthGate>
  )
}
