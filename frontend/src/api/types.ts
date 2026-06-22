export interface FiscalYear {
  year: number
  status: string
}

export interface PaymentRef {
  id: number
  fiscalYear: number
  paymentRefId: string
  description: string
}

export interface PaymentRefSummary {
  id: number
  fiscalYear: number
  paymentRefId: string
  description: string
  caAmountEur: number
  paAmountEur: number
  committedEur: number
  spentEur: number
  availableToCommitEur: number
  availableToPayEur: number
}

export interface Appropriation {
  id: number
  paymentRefId: number
  paymentRefCode: string
  fiscalYear: number
  caAmountEur: number
  paAmountEur: number
  creditOrigin: string
  source: string
  effectiveDate: string
  note?: string
}

export interface Commitment {
  id: number
  paymentRefId: number
  paymentRefCode: string
  fiscalYear: number
  reference: string
  amountEur: number
  date: string
  counterparty?: string
  status: string
}

export interface Actual {
  id: number
  paymentRefId: number
  paymentRefCode: string
  fiscalYear: number
  period: string
  commitmentId?: number
  invoiceId?: number
  amountEur: number
  date: string
  description?: string
  consultant?: string
  source: string
}

export interface MonthlySummaryRow {
  developer: string
  period: string
  hours: number
  computedAmountEur: number
}

export interface DiscoveredUser {
  taskmanUserId: number | null
  name: string
  alreadyImported: boolean
}

export interface RateCard {
  id: number
  company: string
  profile: string
  dailyRateEur: number
  intraMurosRateEur: number | null
}

export interface Contractor {
  id: number
  name: string
  company: string
  profile: string | null
  taskmanUserId: number | null
}

export interface TaskmanCost {
  id: number
  fiscalYear: number
  period: string
  taskmanProject: string
  taskmanCategory: string
  developer: string
  hours: number
  computedAmountEur: number
  paymentRefId: number | null
  paymentRefCode: string | null
  consultant: string | null
  attributionStatus: string
  externalRef: string | null
}

export interface IngestSummary {
  period: string
  entriesProcessed: number
  mapped: number
  assumedDefault: number
  unmapped: number
  excluded: number
  totalComputedEur: number
  warnings: string[]
}

export interface RedmineProject {
  id: number
  name: string
  identifier: string
  status: number
}
