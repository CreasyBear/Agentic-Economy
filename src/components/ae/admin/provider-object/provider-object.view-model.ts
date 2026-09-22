import type { AdminProviderView } from '@/lib/operator/admin-console/views'
import { timestampIso } from '@/lib/ui/format-time'
import {
  aeStatusValues,
  getStatusPresentation,
  type AeStatus,
  type AeStatusPresentation,
} from '@/lib/ui/status-presentation'

const statusByValue: Partial<Record<string, AeStatus>> = Object.fromEntries(
  aeStatusValues.map((status) => [status, status]),
)
const perthTimestampFormatter = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Australia/Perth',
})

const payoutStatus: Record<AdminProviderView['payout'], AeStatus> = {
  connected: 'connected',
  not_connected: 'disconnected',
  unavailable: 'unavailable',
}

export function providerStatusLabel(value: string): string {
  const status = statusByValue[value]
  if (status !== undefined) return getStatusPresentation(status).label
  const words = value.replaceAll('_', ' ')
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

export function providerStatusPresentation(value: string): AeStatusPresentation | null {
  const status = statusByValue[value]
  return status === undefined ? null : getStatusPresentation(status)
}

export function providerPayoutLabel(value: AdminProviderView['payout']): string {
  return getStatusPresentation(payoutStatus[value]).label
}

export function providerTimestamp(value: number): Readonly<{ label: string; iso: string }> {
  return {
    label: perthTimestampFormatter.format(value),
    iso: timestampIso(value),
  }
}
