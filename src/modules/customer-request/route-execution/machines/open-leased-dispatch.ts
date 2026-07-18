import { currentLeasedInvocation } from './current-leased-invocation'
import type { DispatchLifecycleOpenPorts } from './dispatch-lifecycle-ports'
import type { OpenLeasedDispatchCommand, OpenLeasedDispatchResult } from './types'

export async function openLeasedDispatch(
  args: OpenLeasedDispatchCommand,
  ports: DispatchLifecycleOpenPorts,
): Promise<OpenLeasedDispatchResult> {
  const material = await currentLeasedInvocation({
    dispatchRef: args.dispatchRef,
    workerId: args.workerId,
    now: ports.now(),
  }, ports)
  return material === null
    ? { kind: 'unavailable' }
    : { kind: 'available', invocation: material }
}
