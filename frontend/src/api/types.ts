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

export interface MpsCode {
  id: number
  fiscalYear: number
  code: string
  label: string | null
  rollup: string | null
}

export interface CategoryMpsMap {
  id: number
  fiscalYear: number
  taskmanProject: string
  taskmanCategory: string
  mpsCode: string | null
  excluded: boolean
  note: string | null
}

export interface MpsImportResult {
  fiscalYear: number
  mpsCodes: number
  mappings: number
  excluded: number
  warnings: string[]
}

export interface UnmappedPair {
  taskmanProject: string
  taskmanCategory: string
  hours: number
  entries: number
}

export interface Invoice {
  id: number
  consultant: string
  invoiceRef: string
  fiscalYear: number
  period: string
  paymentRefId: number | null
  paymentRefCode: string | null
  claimedAmountEur: number
  receivedDate: string
  status: string
  verifiedBy: string | null
  verifiedAt: string | null
  note: string | null
}

export interface ExtractedInvoice {
  consultant: string | null
  invoiceRef: string | null
  period: string | null
  claimedAmountEur: number | null
  currency: string | null
  paymentRefHint: string | null
  notes: string | null
  suggestedPaymentRefId: number | null
  suggestedPaymentRefCode: string | null
}

export interface DeveloperLine {
  developer: string
  hours: number
  computedEur: number
}

export interface Verification {
  invoiceId: number
  paymentRefCode: string | null
  period: string
  claimedEur: number
  computedEur: number
  varianceEur: number
  totalHours: number
  breakdown: DeveloperLine[]
}

export interface MpsSplitLine {
  mpsCode: string
  hours: number
  sharePct: number
  amountEur: number
}

export interface Split {
  invoiceId: number
  paymentRefCode: string | null
  period: string
  claimedEur: number
  mappedHours: number
  unmappedHours: number
  lines: MpsSplitLine[]
}
