import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixtureRecords = vi.hoisted(() => new Map<string, unknown>())

vi.mock('@/modules/comparison/internal/local-e2e-read-port', () => {
  return {
    configuredLocalE2EComparisonRead: () => async ({
      businessId,
      offeringRef,
      revision,
    }: {
      businessId: string
      offeringRef: string
      revision: number
    }) => (
      structuredClone(fixtureRecords.get(key(businessId, offeringRef, revision)))
      ?? { kind: 'unavailable', reason: 'revision_unavailable' }
    ),
  }
})

import * as convexSource from '@/lib/server/convex-source'
import {
  comparisonCompareAction,
  offeringComparisonResultSchema,
} from '@/modules/comparison/comparison.actions'
import { runHarnessTool } from '@/modules/harness/action-tool'
import {
  actionToHarnessToolContract,
  createHarnessToolBoundaryInstrumentation,
  harnessToolContractToDefinition,
} from '@/modules/harness/tool-contract'

const NOW = Date.UTC(2026, 6, 23, 10)
const OBSERVED_AT = Date.UTC(2026, 6, 1)
const source = { kind: 'business_supplied' as const }

const professionalSelections = [
  selection('demo-business:studio-north', 'demo-offering:studio-north:web', 1),
  selection('demo-business:studio-south', 'demo-offering:studio-south:web', 1),
] as const

const machineSelections = [
  selection('demo-business:graphql-data', 'demo-offering:graphql-data', 1),
  selection('demo-business:rest-data', 'demo-offering:rest-data', 1),
] as const

describe('Offering comparison vertical and horizontal transfer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    fixtureRecords.clear()
    putFixture(professionalFixture({
      businessId: professionalSelections[0].businessId,
      offeringRef: professionalSelections[0].offeringRef,
      businessName: 'Demo Studio North',
      offeringName: 'Demo website build North',
      price: known(price('AUD 10,000 total', 1_000_000, 'total')),
      currentReference: {
        businessId: professionalSelections[0].businessId,
        offeringRef: professionalSelections[0].offeringRef,
        offeringRevision: 2,
      },
    }))
    putFixture(professionalFixture({
      businessId: professionalSelections[1].businessId,
      offeringRef: professionalSelections[1].offeringRef,
      businessName: 'Demo Studio South',
      offeringName: 'Demo website build South',
      price: known(price('AUD 15,000 total', 1_500_000, 'total')),
    }))
    putFixture(machineFixture({
      businessId: machineSelections[0].businessId,
      offeringRef: machineSelections[0].offeringRef,
      businessName: 'Demo GraphQL Data',
      offeringName: 'Demo GraphQL market feed',
      interfaceFormat: 'graphql',
      authentication: 'none',
      price: known(price('AUD 1 per request', 100, 'request')),
    }))
    putFixture(machineFixture({
      businessId: machineSelections[1].businessId,
      offeringRef: machineSelections[1].offeringRef,
      businessName: 'Demo REST Data',
      offeringName: 'Demo REST market feed',
      interfaceFormat: 'rest_json',
      authentication: 'api_key',
      price: known(price('AUD 2 per request', 200, 'request')),
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('uses one registered read action and host for both unlike profiles with no effects', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const publicMutationSpy = vi.spyOn(convexSource, 'callPublicSourceMutation')
    const mutationSpy = vi.spyOn(convexSource, 'callSourceMutation')
    const instrumentation = createHarnessToolBoundaryInstrumentation()

    const professional = await runComparison(
      professionalSelections,
      ['professional_service:v1:lowest_total_price'],
      instrumentation,
    )
    const machine = await runComparison(
      machineSelections,
      ['machine_data:v1:lowest_request_price'],
      instrumentation,
    )

    expect(professional.actionId).toBe('comparison.compare')
    expect(machine.actionId).toBe(professional.actionId)
    expect(professional.result.schemaVersion).toBe('offering-comparison:v1')
    expect(machine.result.schemaVersion).toBe(professional.result.schemaVersion)
    expect(professional.result.ordering.kind).toBe('ordered')
    expect(machine.result.ordering.kind).toBe('ordered')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(publicMutationSpy).not.toHaveBeenCalled()
    expect(mutationSpy).not.toHaveBeenCalled()
    expect(instrumentation.snapshot()).toMatchObject({
      actionInvocationEmissions: 0,
      controlEmissions: 0,
      attemptEmissions: 0,
      historyEmissions: 0,
    })
  })

  it('keeps professional-service truth unranked until stated facts support an order', async () => {
    const noPriority = await runComparison(professionalSelections, [])
    expect(noPriority.result.ordering).toEqual({
      kind: 'unranked',
      reason: 'no_priority',
    })

    const ordered = await runComparison(
      professionalSelections,
      ['professional_service:v1:lowest_total_price'],
    )
    expect(orderedNames(ordered.result)).toEqual([
      'Demo website build North',
      'Demo website build South',
    ])

    replaceProfessionalPrice(
      professionalSelections[1],
      known(price('AUD 10,000 total', 1_000_000, 'total')),
    )
    const tie = await runComparison(
      professionalSelections,
      ['professional_service:v1:lowest_total_price'],
    )
    expect(tie.result.ordering).toMatchObject({
      kind: 'unranked',
      reason: 'tie',
    })

    replaceProfessionalNorthPrice({
      kind: 'unknown',
      explanation: 'The Demo Studio has not supplied a current fixed price.',
      source,
      observedAt: OBSERVED_AT,
    })
    const unknown = await runComparison(
      professionalSelections,
      ['professional_service:v1:lowest_total_price'],
    )
    expect(unknown.result.ordering).toMatchObject({
      kind: 'unranked',
      reason: 'missing_material_fact',
    })

    replaceProfessionalNorthPrice({
      kind: 'stale',
      lastKnown: price('AUD 10,000 total', 1_000_000, 'total'),
      source,
      observedAt: OBSERVED_AT,
      validUntil: OBSERVED_AT + 1,
    })
    const stale = await runComparison(
      professionalSelections,
      ['professional_service:v1:lowest_total_price'],
    )
    expect(stale.result.ordering).toMatchObject({
      kind: 'unranked',
      reason: 'stale_fact',
    })
  })

  it('keeps the selected revision exact and discloses a newer revision without substitution', async () => {
    const comparison = await runComparison(professionalSelections, [])
    const selected = comparison.result.selections[0]!

    expect(selected.offering.revision).toBe(1)
    expect(selected.newerCurrentReference).toEqual({
      businessId: professionalSelections[0].businessId,
      offeringRef: professionalSelections[0].offeringRef,
      offeringRevision: 2,
    })
  })

  it('makes projection and not-supplied blockers explicit', async () => {
    mutateFixture(machineSelections[0], (fixture) => ({
      ...fixture,
      projectionDisposition: 'partial',
    }))
    const partial = await runComparison(
      machineSelections,
      ['machine_data:v1:lowest_request_price'],
    )
    expect(partial.result.ordering).toMatchObject({
      kind: 'unranked',
      reason: 'partial_projection',
    })

    mutateFixture(machineSelections[0], (fixture) => ({
      ...fixture,
      projectionDisposition: 'stale',
    }))
    const stale = await runComparison(
      machineSelections,
      ['machine_data:v1:lowest_request_price'],
    )
    expect(stale.result.ordering).toMatchObject({
      kind: 'unranked',
      reason: 'stale_fact',
    })

    mutateFixture(machineSelections[0], (fixture) => {
      const profile = machineProfile(fixture)
      return withMachineProfile({
        ...fixture,
        projectionDisposition: 'current',
      }, {
        ...profile,
        authentication: {
          kind: 'not_supplied',
          source,
          observedAt: OBSERVED_AT,
        },
      })
    })
    const notSupplied = await runComparison(
      machineSelections,
      ['machine_data:v1:no_authentication_preferred'],
    )
    expect(notSupplied.result.ordering).toMatchObject({
      kind: 'unranked',
      reason: 'missing_material_fact',
    })
  })

  it('changes the machine order when the decisive registered fact changes', async () => {
    const baseline = await runComparison(
      machineSelections,
      ['machine_data:v1:lowest_request_price'],
    )
    expect(orderedNames(baseline.result)).toEqual([
      'Demo GraphQL market feed',
      'Demo REST market feed',
    ])

    mutateFixture(machineSelections[1], (fixture) => {
      const profile = machineProfile(fixture)
      return withMachineProfile(fixture, {
        ...profile,
        priceBasis: known(price('AUD 0.50 per request', 50, 'request')),
      })
    })
    const changed = await runComparison(
      machineSelections,
      ['machine_data:v1:lowest_request_price'],
    )
    expect(orderedNames(changed.result)).toEqual([
      'Demo REST market feed',
      'Demo GraphQL market feed',
    ])
  })

  it('preserves common rows and marks profile-only cross-profile facts not comparable', async () => {
    const comparison = await runComparison(
      [professionalSelections[0], machineSelections[0]],
      ['professional_service:v1:lowest_total_price'],
    )

    expect(comparison.result.ordering).toMatchObject({
      kind: 'unranked',
      reason: 'not_comparable',
    })
    expect(comparison.result.rows
      .filter(({ dimensionId }) => dimensionId.startsWith('common:'))
      .every(({ cells }) => cells.every(({ cell }) => cell.kind === 'known')))
      .toBe(true)
    expect(comparison.result.rows
      .filter(({ dimensionId }) => !dimensionId.startsWith('common:'))
      .every(({ cells }) => cells.some(({ cell }) => (
        cell.kind === 'not_comparable'
        && cell.reason === 'profile_mismatch'
      )))).toBe(true)
  })
})

async function runComparison(
  selections: readonly ReturnType<typeof selection>[],
  priorities: readonly (
    | 'professional_service:v1:lowest_total_price'
    | 'machine_data:v1:lowest_request_price'
    | 'machine_data:v1:no_authentication_preferred'
  )[],
  instrumentation = createHarnessToolBoundaryInstrumentation(),
) {
  const tool = harnessToolContractToDefinition(actionToHarnessToolContract(
    comparisonCompareAction,
    instrumentation,
  ))
  const outcome = await runHarnessTool({
    tool,
    input: { selections, priorities },
    surface: 'agentJson',
    allowWrites: false,
  })
  expect(outcome.result.status).toBe('ok')
  const actionOutput = comparisonCompareAction.outputSchema.parse(
    outcome.result.output,
  ) as { kind: 'comparison' } & Record<string, unknown>
  expect(actionOutput.kind).toBe('comparison')
  const { kind: _transportKind, ...semanticResult } = actionOutput
  return {
    actionId: tool.id,
    result: offeringComparisonResultSchema.parse(semanticResult),
  }
}

function selection(businessId: string, offeringRef: string, offeringRevision: number) {
  return { businessId, offeringRef, offeringRevision, projectionObservedAt: 100 }
}

function key(businessId: string, offeringRef: string, revision: number): string {
  return `${businessId}\u0000${offeringRef}\u0000${revision}`
}

function putFixture(fixture: ReturnType<typeof professionalFixture> | ReturnType<typeof machineFixture>) {
  fixtureRecords.set(key(
    fixture.business.businessId,
    fixture.offering.offeringRef,
    fixture.offering.revision,
  ), fixture)
}

function mutateFixture(
  reference: ReturnType<typeof selection>,
  mutate: (fixture: any) => any,
) {
  const fixtureKey = key(reference.businessId, reference.offeringRef, reference.offeringRevision)
  fixtureRecords.set(fixtureKey, mutate(structuredClone(fixtureRecords.get(fixtureKey))))
}

function replaceProfessionalNorthPrice(priceBasis: unknown) {
  replaceProfessionalPrice(professionalSelections[0], priceBasis)
}

function replaceProfessionalPrice(
  reference: ReturnType<typeof selection>,
  priceBasis: unknown,
) {
  mutateFixture(reference, (fixture) => ({
    ...fixture,
    offering: {
      ...fixture.offering,
      comparison: {
        ...fixture.offering.comparison,
        profile: {
          ...fixture.offering.comparison.profile,
          priceBasis,
        },
      },
    },
  }))
}

function professionalFixture(input: {
  businessId: string
  offeringRef: string
  businessName: string
  offeringName: string
  price: unknown
  currentReference?: {
    businessId: string
    offeringRef: string
    offeringRevision: number
  }
}) {
  return fixtureBase(input, {
    profileId: 'professional_service:v1' as const,
    scopeBasis: known('A labelled demo website delivery scope'),
    priceBasis: input.price,
    timingBasis: known('Six labelled demo weeks'),
    serviceArea: known('Perth, Western Australia'),
  })
}

function machineFixture(input: {
  businessId: string
  offeringRef: string
  businessName: string
  offeringName: string
  interfaceFormat: 'graphql' | 'rest_json'
  authentication: 'none' | 'api_key'
  price: unknown
}) {
  return fixtureBase(input, {
    profileId: 'machine_data:v1' as const,
    interfaceFormat: known(input.interfaceFormat),
    requestMethod: known('GET' as const),
    authentication: known(input.authentication),
    priceBasis: input.price,
    freshnessOrUpdateCadence: known('Labelled demo data updates every minute'),
  })
}

function fixtureBase(
  input: {
    businessId: string
    offeringRef: string
    businessName: string
    offeringName: string
    currentReference?: {
      businessId: string
      offeringRef: string
      offeringRevision: number
    }
  },
  profile: unknown,
) {
  return {
    kind: 'resolved' as const,
    business: {
      businessId: input.businessId,
      slug: input.businessId.replaceAll(':', '-'),
      name: input.businessName,
    },
    offering: {
      offeringRef: input.offeringRef,
      revision: 1,
      name: input.offeringName,
      category: 'Labelled demo',
      summary: 'Labelled fixture data for a source-only comparison falsification eval.',
      comparison: {
        schemaVersion: 'offering-comparison:v1' as const,
        profile,
      },
    },
    publication: {
      publishedAt: OBSERVED_AT,
      safeDisplayDisposition: 'retain_safe_history' as const,
    },
    projectionDisposition: 'current' as const,
    ...(input.currentReference === undefined
      ? {}
      : { currentReference: input.currentReference }),
  }
}

function machineProfile(fixture: any): any {
  return fixture.offering.comparison.profile
}

function withMachineProfile(fixture: any, profile: any): any {
  return {
    ...fixture,
    offering: {
      ...fixture.offering,
      comparison: {
        ...fixture.offering.comparison,
        profile,
      },
    },
  }
}

function known<const Value>(value: Value) {
  return { kind: 'known' as const, value, source, observedAt: OBSERVED_AT }
}

function price(
  description: string,
  amountMinor: number,
  unit: 'total' | 'request',
) {
  return { description, currency: 'AUD', amountMinor, unit }
}

function orderedNames(result: ReturnType<typeof offeringComparisonResultSchema.parse>) {
  if (result.ordering.kind !== 'ordered') return []
  const nameById = new Map(result.selections.map((selection) => [
    result.rows[0]!.cells.find((cell) => (
      cell.selectionId.includes(selection.selection.businessId)
    ))?.selectionId,
    selection.offering.name,
  ]))
  return result.ordering.orderedSelectionIds.map((id) => nameById.get(id))
}
