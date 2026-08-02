import { currentDispatchInvocation } from './current-dispatch-invocation'
import type { DispatchLifecycleOpenPorts } from './dispatch-lifecycle-ports'
import type { OpenDispatchCommand, OpenDispatchResult } from './types'

export async function openDispatch(
  args: OpenDispatchCommand,
  ports: DispatchLifecycleOpenPorts,
): Promise<OpenDispatchResult> {
  const material = await currentDispatchInvocation({
    dispatchRef: args.dispatchRef,
    now: ports.now(),
  }, ports)
  return material === null
    ? { kind: 'unavailable' }
    : { kind: 'available', invocation: material }
}
