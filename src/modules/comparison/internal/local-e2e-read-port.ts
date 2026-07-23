import { LOCAL_E2E_COMPARISON_FIXTURES } from '@/lib/dev/local-e2e-comparison-fixtures'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'

type LocalReadArgs = Readonly<{
  businessId: string
  offeringRef: string
  revision: number
}>

export type LocalE2EComparisonRead = (
  args: LocalReadArgs,
) => Promise<unknown>

export function configuredLocalE2EComparisonRead(): LocalE2EComparisonRead | undefined {
  if (!isLocalE2EAuthBypassEnabled()) return undefined
  return readLocalE2EComparisonFixture
}

export async function readLocalE2EComparisonFixture(
  reference: LocalReadArgs,
): Promise<unknown> {
  return LOCAL_E2E_COMPARISON_FIXTURES.find((fixture) => (
    fixture.business.businessId === reference.businessId
    && fixture.offering.offeringRef === reference.offeringRef
    && fixture.offering.revision === reference.revision
  )) ?? { kind: 'unavailable', reason: 'revision_unavailable' }
}
