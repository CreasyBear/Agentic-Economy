import type { ActionResult } from '@/modules/common/action'
import type { InMemoryControlSnapshot } from './contracts'

export function roundTripControlSnapshot<Input, Result extends ActionResult>(
  snapshot: InMemoryControlSnapshot<Input, Result>,
): InMemoryControlSnapshot<Input, Result> {
  return JSON.parse(JSON.stringify(snapshot)) as InMemoryControlSnapshot<Input, Result>
}
