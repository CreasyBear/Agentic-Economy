import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'

export const INVALID_PRICE_DIAGNOSTIC = {
  whatHappened: 'Invalid AUD price amount.',
  financialImpact: 'A$0.00 affected — pricing revision not published.',
  nextStep:
    'Enter a valid positive dollar amount with up to 2 decimal places (e.g. 0.15).',
} as const

export const PUBLISH_FAILURE_DIAGNOSTIC = {
  whatHappened: 'Failed to publish pricing revision.',
  financialImpact: 'A$0.00 affected — existing price remains active.',
  nextStep: 'Please check your connection and try publishing again.',
} as const

export const PERCENT_ADJUSTMENTS = [
  { label: '+10%', factor: 1.1 },
  { label: '+25%', factor: 1.25 },
  { label: '-10%', factor: 0.9 },
] as const

export const TIER_CHIP_VALUES = ['0.05', '0.10', '0.25', '0.50'] as const

export type PriceDeltaPreviewProps = Readonly<{
  formattedCurrent: string
  formattedNew: string
  deltaText: string
  baseText: string
  gstText: string
  totalText: string
}>

export type PriceAdjustmentChipsProps = Readonly<{
  priceAud: string
  pending: boolean
  onPercentageAdjustment: (factor: number) => void
  onTierValue: (value: string) => void
}>

export type GstSplitBreakdownProps = Readonly<{
  baseText: string
  gstText: string
  totalText: string
}>

export type PriceRevisionAmountFieldProps = Readonly<{
  priceAud: string
  pending: boolean
  onPriceAudChange: (value: string) => void
}>

export type PriceRevisionDiagnosticSlotProps = Readonly<{
  diagnostic?: Rule4Diagnostic
}>
