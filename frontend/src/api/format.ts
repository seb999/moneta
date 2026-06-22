const FMT = new Intl.NumberFormat('en-EU', {
  style: 'decimal',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function eur(amount: number): string {
  return `€ ${FMT.format(amount)}`
}

export function eurClass(amount: number): string {
  if (amount < 0) return 'eur negative'
  return 'eur'
}
