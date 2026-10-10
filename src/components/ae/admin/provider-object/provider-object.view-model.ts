import { formatTimestamp, timestampIso } from '@/lib/ui/format-time'


export function providerTimestamp(value: number): Readonly<{ label: string; iso: string }> {
  return {
    label: formatTimestamp(value, 'Australia/Perth'),
    iso: timestampIso(value),
  }
}
