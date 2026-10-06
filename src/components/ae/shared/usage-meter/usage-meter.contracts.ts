export type AeApproximateQuotaMeterProps = Readonly<{
  label: string
  percentage: number
  limitState: 'under' | 'at' | 'over'
  summary: string
  /** `compact`: one labelled image for tables and gauges. `detailed`: named group with a visible limit badge. */
  density?: 'compact' | 'detailed'
}>
