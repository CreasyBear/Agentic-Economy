import type {
  ComparisonOfferingReadPort,
  ComparisonSelectionRef,
  ComparisonSelectionRefusalReason,
  ComparisonUrlState,
  ExactOfferingReference,
  ResolveComparisonSelectionsResult,
  ResolvedComparisonSelection,
} from './contract'

export async function resolveComparisonSelections(input: Readonly<{
  state: ComparisonUrlState
  resolvedAt: number
  port: ComparisonOfferingReadPort
}>): Promise<ResolveComparisonSelectionsResult> {
  const selections: ResolvedComparisonSelection[] = []
  const refusals: Array<Readonly<{
    selection: ComparisonSelectionRef
    reason: ComparisonSelectionRefusalReason
  }>> = []

  for (const selection of input.state.selections) {
    const reference = exactReference(selection)
    const live = await input.port.readLiveAvailability(reference)
    if (live.kind === 'unavailable') {
      refusals.push({ selection, reason: live.reason })
      continue
    }

    const historical = await input.port.readExactPublicOffering(reference)
    if (historical.kind === 'unavailable') {
      refusals.push({ selection, reason: historical.reason })
      continue
    }
    if (!matchesExactReference(historical, reference)) {
      refusals.push({ selection, reason: 'lineage_mismatch' })
      continue
    }

    selections.push({
      selection,
      business: historical.business,
      offering: historical.offering,
      publication: historical.publication,
      projectionDisposition: historical.projectionDisposition,
      ...(isNewerCurrent(live.currentReference, reference)
        ? { newerCurrentReference: live.currentReference }
        : {}),
      resolvedAt: input.resolvedAt,
    })
  }

  return {
    kind: 'resolved',
    disposition: (
      refusals.length === 0
      && selections.every((selection) => selection.projectionDisposition === 'current')
    ) ? 'current' : 'partial',
    selections,
    refusals,
  }
}

function exactReference(selection: ComparisonSelectionRef): ExactOfferingReference {
  return {
    businessId: selection.businessId,
    offeringRef: selection.offeringRef,
    offeringRevision: selection.offeringRevision,
  }
}

function matchesExactReference(
  result: Extract<
    Awaited<ReturnType<ComparisonOfferingReadPort['readExactPublicOffering']>>,
    { kind: 'resolved' }
  >,
  reference: ExactOfferingReference,
): boolean {
  return result.business.businessId === reference.businessId
    && result.offering.offeringRef === reference.offeringRef
    && result.offering.revision === reference.offeringRevision
}

function isNewerCurrent(
  current: ExactOfferingReference | undefined,
  selected: ExactOfferingReference,
): current is ExactOfferingReference {
  return current !== undefined
    && current.businessId === selected.businessId
    && current.offeringRef === selected.offeringRef
    && current.offeringRevision > selected.offeringRevision
}
