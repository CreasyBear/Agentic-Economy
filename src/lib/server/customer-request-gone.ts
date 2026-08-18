import { problem } from '@/lib/server/problem'
import { withRfc9745DeprecationNotice } from '@/modules/product-frontier/deprecation-notice'
import { quarantineSurfaceRetiredProblemInput } from '@/modules/product-frontier/quarantine-write-admission'

export function retiredCustomerRequestResponse(
  actionId = 'customerRequest.run',
): Response {
  return withRfc9745DeprecationNotice(
    problem(quarantineSurfaceRetiredProblemInput(actionId)),
  )
}
