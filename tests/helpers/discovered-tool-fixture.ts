import type { ConvexFixtureBackend } from './convex-fixtures'
import { internal } from '../../convex/_generated/api'
import { admitFacilitatorDiscoveryItems } from '@/modules/capability-supply/server'
import timezoneFixture from '@/modules/capability-supply/internal/x402-bazaar-fixtures/timezone-payment-required-2026-08-19.json'

/** A real captured Bazaar declaration, admitted without any readiness observation. */
export async function admitDiscoveredToolFixture(backend: ConvexFixtureBackend, options: { withoutExample?: boolean } = {}) {
  await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
  const workload = await backend.query(internal.workloadCron.admit, { name: 'refresh facilitator discovery' })
  const admission = await admitFacilitatorDiscoveryItems([structuredClone(timezoneFixture.paymentRequired)])
  let draft = admission.admitted[0]
  if (draft === undefined) throw new Error(`fixture_admission_failed:${JSON.stringify(admission.skipped)}`)
  if (options.withoutExample === true) {
    const source = JSON.parse(draft.sourceImportJson)
    source.contract.inputExamples = []
    draft = { ...draft, sourceImportJson: JSON.stringify(source) }
  }
  const result = await backend.mutation(internal.facilitatorDiscovery.reconcile, { items: [draft], complete: false, deadlineAt: Date.now() + 60_000, workload })
  const toolRef = result.toolRefs[0]
  if (toolRef === undefined) throw new Error(`fixture_publication_failed:${JSON.stringify(result)}`)
  return { toolRef, draft, workload, paymentRequired: structuredClone(timezoneFixture.paymentRequired) }
}
