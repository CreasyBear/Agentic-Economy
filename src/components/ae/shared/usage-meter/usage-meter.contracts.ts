export type AeApproximateQuotaMeterProps = Readonly<{
  label: string
  percentage: number
  limitState: 'under' | 'at' | 'over'
  summary: string
}>
