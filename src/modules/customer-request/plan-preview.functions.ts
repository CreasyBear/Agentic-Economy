import { callPublicSourceAction, sourceAction } from '@/lib/server/convex-source'

import type { PreviewCustomerRequestInput, PreviewCustomerRequestResult } from './application/public'

const previewSourceAction = sourceAction<PreviewCustomerRequestInput, PreviewCustomerRequestResult>(
  'customerRequestApplication:preview',
)

export async function previewCustomerRequestThroughSource(
  input: PreviewCustomerRequestInput,
): Promise<PreviewCustomerRequestResult> {
  return callPublicSourceAction(previewSourceAction, input)
}
