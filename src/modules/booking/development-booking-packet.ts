import type { ActionResult } from '@/modules/common/action'
import type { BookingInvocationRun } from './development-booking-runner'

export function projectDurableRun<Result extends ActionResult>(
  run: BookingInvocationRun<Result & (
    import('./development-booking.actions').DevelopmentBookingResult |
    import('./development-booking.actions').DevelopmentBookingCancellationResult
  )>,
) {
  return {
    controls: [...run.state.controls.values()],
    attempts: [...(run.state.attempts.get(run.view.invocationRef)?.values() ?? [])],
    history: run.state.history.get(run.view.invocationRef) ?? [],
    source: {
      input: run.source.input,
      prepared: run.source.prepared,
      result: run.source.result,
      resultIdentity: run.source.resultIdentity,
    },
  }
}
