import type { Appropriation, Actual, CategoryMpsMap, Commitment, Contractor, DiscoveredUser, ExtractedInvoice, FiscalYear, IngestSummary, Invoice, InvoiceLineInput, MonthlySummaryRow, MpsCode, MpsImportResult, MpsSplitLine, PaymentRef, PaymentRefSummary, RateCard, RedmineProject, Split, TaskmanCost, UnmappedPair, Verification } from './types'
import { getTaskmanKey } from './taskmanKey'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const key = getTaskmanKey()
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'X-Taskman-Key': key } : {}),
      ...init?.headers,
    },
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
export const syncPaymentRefsFromTaskman = (year: number, projectId: number) =>
  request<{ foundInTaskman: number; created: number; createdRefs: string[] }>(
    `/payment-refs/sync-from-taskman?year=${year}&projectId=${projectId}`, { method: 'POST' })

// Appropriations
export const getAppropriations = (year?: number, paymentRefId?: number) => {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  if (paymentRefId) params.set('paymentRefId', String(paymentRefId))
  return request<Appropriation[]>(`/appropriations?${params}`)
}
export type AppropriationInput = {
  paymentRefId: number
  fiscalYear: number
  caAmountEur: number
  paAmountEur: number
  creditOrigin?: string
  source?: string
  effectiveDate?: string
  note?: string
}
export const createAppropriation = (data: AppropriationInput) =>
  request<Appropriation>('/appropriations', { method: 'POST', body: JSON.stringify(data) })
export const updateAppropriation = (id: number, data: AppropriationInput) =>
  request<Appropriation>(`/appropriations/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteAppropriation = (id: number) =>
  request<void>(`/appropriations/${id}`, { method: 'DELETE' })

// Commitments
export const getCommitments = (year?: number, paymentRefId?: number) => {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  if (paymentRefId) params.set('paymentRefId', String(paymentRefId))
  return request<Commitment[]>(`/commitments?${params}`)
}
export type CommitmentInput = {
  paymentRefId: number
  fiscalYear: number
  reference: string
  amountEur: number
  date: string
  counterparty?: string
  status?: string
  contractType?: string
}
export const createCommitment = (data: CommitmentInput) =>
  request<Commitment>('/commitments', { method: 'POST', body: JSON.stringify(data) })
export const updateCommitment = (id: number, data: CommitmentInput) =>
  request<Commitment>(`/commitments/${id}`, { method: 'PUT', body: JSON.stringify(data) })
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

// MPS reference data
export const getMpsCodes = (year: number) => request<MpsCode[]>(`/mps/codes?year=${year}`)
export const getMpsMappings = (year: number) => request<CategoryMpsMap[]>(`/mps/mappings?year=${year}`)
export const createMpsMapping = (data: { fiscalYear: number; taskmanProject: string; taskmanCategory: string | null; mpsCode: string | null; excluded: boolean; note: string | null }) =>
  request<CategoryMpsMap>('/mps/mappings', { method: 'POST', body: JSON.stringify(data) })
export const updateMpsMapping = (id: number, data: { fiscalYear: number; taskmanProject: string; taskmanCategory: string | null; mpsCode: string | null; excluded: boolean; note: string | null }) =>
  request<void>(`/mps/mappings/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteMpsMapping = (id: number) =>
  request<void>(`/mps/mappings/${id}`, { method: 'DELETE' })
export const getMpsUnmapped = (year: number) => request<UnmappedPair[]>(`/mps/unmapped?year=${year}`)
export const importMpsBundled = (year: number) =>
  request<MpsImportResult>(`/mps/import-bundled?year=${year}`, { method: 'POST' })
export const importMpsFile = async (year: number, file: File) => {
  const form = new FormData()
  form.append('file', file)
  form.append('year', String(year))
  const res = await fetch('/api/mps/import', { method: 'POST', body: form })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json() as Promise<MpsImportResult>
}

// Invoices (M3 — verification)
export const getInvoices = (year?: number, status?: string) => {
  const p = new URLSearchParams()
  if (year) p.set('year', String(year))
  if (status) p.set('status', status)
  return request<Invoice[]>(`/invoices?${p}`)
}
export const createInvoice = (data: {
  consultant: string; invoiceRef: string; fiscalYear: number; period: string
  paymentRefId: number; claimedAmountEur: number; receivedDate?: string; note?: string
  lines?: InvoiceLineInput[]
}) => request<Invoice>('/invoices', { method: 'POST', body: JSON.stringify(data) })
export const deleteInvoice = (id: number) => request<void>(`/invoices/${id}`, { method: 'DELETE' })
export const getVerification = (id: number) => request<Verification>(`/invoices/${id}/verification`)
export const verifyInvoice = (id: number, data: { verifiedBy?: string; note?: string }) =>
  request<void>(`/invoices/${id}/verify`, { method: 'POST', body: JSON.stringify(data) })
export const disputeInvoice = (id: number, data: { verifiedBy?: string; note?: string }) =>
  request<void>(`/invoices/${id}/dispute`, { method: 'POST', body: JSON.stringify(data) })
export const getSplit = (id: number) => request<Split>(`/invoices/${id}/split`)
export const getInvoiceLines = (id: number) => request<MpsSplitLine[]>(`/invoices/${id}/lines`)
export const extractInvoice = async (file: File, year?: number) => {
  const form = new FormData()
  form.append('file', file)
  const key = getTaskmanKey()
  const res = await fetch(`/api/invoices/extract${year ? `?year=${year}` : ''}`, {
    method: 'POST',
    body: form,
    headers: key ? { 'X-Taskman-Key': key } : undefined,
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json() as Promise<ExtractedInvoice>
}
