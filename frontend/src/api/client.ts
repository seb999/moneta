import type { Appropriation, Actual, Commitment, Contractor, DiscoveredUser, FiscalYear, IngestSummary, MonthlySummaryRow, PaymentRef, PaymentRefSummary, RateCard, RedmineProject, TaskmanCost } from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// Fiscal Years
export const getFiscalYears = () => request<FiscalYear[]>('/fiscal-years')
export const createFiscalYear = (year: number, status = 'open') =>
  request<FiscalYear>('/fiscal-years', { method: 'POST', body: JSON.stringify({ year, status }) })

// Payment Refs
export const getPaymentRefs = (year?: number) =>
  request<PaymentRef[]>(`/payment-refs${year ? `?year=${year}` : ''}`)
export const getPaymentRefSummary = (year: number) =>
  request<PaymentRefSummary[]>(`/payment-refs/summary?year=${year}`)
export const createPaymentRef = (data: Omit<PaymentRef, 'id'>) =>
  request<PaymentRef>('/payment-refs', { method: 'POST', body: JSON.stringify(data) })
export const updatePaymentRef = (id: number, data: Omit<PaymentRef, 'id'>) =>
  request<void>(`/payment-refs/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deletePaymentRef = (id: number) =>
  request<void>(`/payment-refs/${id}`, { method: 'DELETE' })

// Appropriations
export const getAppropriations = (year?: number, paymentRefId?: number) => {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  if (paymentRefId) params.set('paymentRefId', String(paymentRefId))
  return request<Appropriation[]>(`/appropriations?${params}`)
}
export const createAppropriation = (data: {
  paymentRefId: number
  fiscalYear: number
  caAmountEur: number
  paAmountEur: number
  creditOrigin?: string
  effectiveDate?: string
  note?: string
}) => request<Appropriation>('/appropriations', { method: 'POST', body: JSON.stringify(data) })
export const deleteAppropriation = (id: number) =>
  request<void>(`/appropriations/${id}`, { method: 'DELETE' })

// Commitments
export const getCommitments = (year?: number, paymentRefId?: number) => {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  if (paymentRefId) params.set('paymentRefId', String(paymentRefId))
  return request<Commitment[]>(`/commitments?${params}`)
}
export const createCommitment = (data: {
  paymentRefId: number
  fiscalYear: number
  reference: string
  amountEur: number
  date: string
  counterparty?: string
  status?: string
}) => request<Commitment>('/commitments', { method: 'POST', body: JSON.stringify(data) })
export const updateCommitmentStatus = (id: number, status: string) =>
  request<void>(`/commitments/${id}/status`, { method: 'PATCH', body: JSON.stringify(status) })

// Actuals
export const getActuals = (year?: number, paymentRefId?: number) => {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  if (paymentRefId) params.set('paymentRefId', String(paymentRefId))
  return request<Actual[]>(`/actuals?${params}`)
}
export const createActual = (data: {
  paymentRefId: number
  fiscalYear: number
  period: string
  amountEur: number
  date: string
  description?: string
  consultant?: string
  source?: string
}) => request<Actual>('/actuals', { method: 'POST', body: JSON.stringify(data) })
export const deleteActual = (id: number) =>
  request<void>(`/actuals/${id}`, { method: 'DELETE' })

// Contractors
export const getContractors = () => request<Contractor[]>('/contractors')
export const createContractor = (data: { name: string; company: string; profile?: string | null; taskmanUserId?: number }) =>
  request<Contractor>('/contractors', { method: 'POST', body: JSON.stringify(data) })
export const updateContractor = (id: number, data: { name: string; company: string; profile?: string | null; taskmanUserId?: number }) =>
  request<void>(`/contractors/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const setContractorProfile = (id: number, profile: string | null) =>
  request<void>(`/contractors/${id}/profile`, { method: 'PATCH', body: JSON.stringify(profile) })
export const deleteContractor = (id: number) =>
  request<void>(`/contractors/${id}`, { method: 'DELETE' })
export const discoverContractors = (projectId: number, monthsBack = 12) =>
  request<DiscoveredUser[]>(`/contractors/discover?projectId=${projectId}&monthsBack=${monthsBack}`)
export const discoverContractorsByRef = (paymentRefId: number) =>
  request<DiscoveredUser[]>(`/contractors/discover-by-ref?paymentRefId=${paymentRefId}`)
export const bulkImportContractors = (users: { taskmanUserId: number; name: string; company: string; profile?: string | null }[]) =>
  request<number>('/contractors/bulk-import', { method: 'POST', body: JSON.stringify({ users }) })

// Rate Cards
export const getRateCards = () => request<RateCard[]>('/contractors/rate-cards')
export const upsertRateCard = (data: { company: string; profile: string; dailyRateEur: number; intraMurosRateEur?: number | null }) =>
  request<RateCard>('/contractors/rate-cards', { method: 'PUT', body: JSON.stringify(data) })
export const deleteRateCard = (id: number) =>
  request<void>(`/contractors/rate-cards/${id}`, { method: 'DELETE' })

// Ingestion
export const getRedmineProjects = () => request<RedmineProject[]>('/ingestion/projects')
export const getSyncedProjects = () => request<{ projectId: number; name: string }[]>('/ingestion/synced-projects')
export const syncRedmineProjects = () => request<number>('/ingestion/sync-projects', { method: 'POST' })
export const ingestMonth = (fiscalYear: number, period: string, opts?: { projectId?: number; paymentRefId?: number }) =>
  request<IngestSummary>('/ingestion/ingest', {
    method: 'POST',
    body: JSON.stringify({ fiscalYear, period, projectId: opts?.projectId, paymentRefId: opts?.paymentRefId }),
  })
// Reports
export const getMonthlySummary = (fiscalYear: number, filter: { paymentRefId?: number; taskmanProject?: string }, months = 12) => {
  const params = new URLSearchParams({ fiscalYear: String(fiscalYear), months: String(months) })
  if (filter.paymentRefId) params.set('paymentRefId', String(filter.paymentRefId))
  if (filter.taskmanProject) params.set('taskmanProject', filter.taskmanProject)
  return request<MonthlySummaryRow[]>(`/reports/monthly-summary?${params}`)
}
export const ingestYear = (fiscalYear: number) =>
  request<string[]>(`/reports/ingest-year?fiscalYear=${fiscalYear}`, { method: 'POST' })
export const getReportTaskmanProjects = (fiscalYear: number) =>
  request<string[]>(`/reports/taskman-projects?fiscalYear=${fiscalYear}`)

export const getTaskmanCosts = (year?: number, period?: string, paymentRefId?: number) => {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  if (period) params.set('period', period)
  if (paymentRefId) params.set('paymentRefId', String(paymentRefId))
  return request<TaskmanCost[]>(`/ingestion/taskman-costs?${params}`)
}
