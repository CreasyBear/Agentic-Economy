import { formatPerthTimestamp, timestampIso } from '@/lib/ui/format-time'


export function providerTimestamp(value: number): Readonly<{ label: string; iso: string }> {
  return {
    label: formatPerthTimestamp(value),
    iso: timestampIso(value),
  }
}
