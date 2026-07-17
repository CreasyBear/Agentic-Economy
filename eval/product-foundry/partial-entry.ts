export type PartialEntryCapability =
  | 'discover'
  | 'qualify'
  | 'quote'
  | 'commit'
  | 'inspect'
  | 'recover'

export type PartialEntryCase = Readonly<{
  id: string
  capability: PartialEntryCapability
  callerAlreadyHas: readonly string[]
  callerWants: string
  requiredInput: readonly string[]
  acceptableExit: readonly string[]
}>

export type PartialEntrySurface = Readonly<{
  capability: PartialEntryCapability
  surface: string
  acceptedInput: readonly string[]
  requiresAeLineage: readonly string[]
  output: readonly string[]
  currentMaturity: 'current' | 'internal_or_target' | 'absent'
}>

export type PartialEntryResult = Readonly<{
  caseId: string
  capability: PartialEntryCapability
  disposition:
    | 'independent_current'
    | 'ae_lineage_only'
    | 'human_handoff_only'
    | 'not_addressable'
  matchingSurfaces: readonly string[]
  missingInputs: readonly string[]
  conclusion: string
}>

export const PARTIAL_ENTRY_CASES: readonly PartialEntryCase[] = [
  {
    id: 'public-business-discovery',
    capability: 'discover',
    callerAlreadyHas: ['service need', 'location'],
    callerWants: 'Find published businesses without starting an orchestrated Request',
    requiredInput: ['search query'],
    acceptableExit: ['published candidate businesses'],
  },
  {
    id: 'named-business-qualification',
    capability: 'qualify',
    callerAlreadyHas: ['structured requirement', 'named business candidates'],
    callerWants: 'Evaluate only the supplied businesses and return fit, exclusions, and unknowns',
    requiredInput: ['structured requirement', 'named business candidates'],
    acceptableExit: ['provider-specific fit decision', 'unresolved questions'],
  },
  {
    id: 'candidate-supplied-quotes',
    capability: 'quote',
    callerAlreadyHas: ['comparable requirement', 'named business candidates'],
    callerWants: 'Request comparable proposals without asking AE to rediscover or run the outcome',
    requiredInput: ['comparable requirement', 'named business candidates'],
    acceptableExit: ['attributable proposals', 'refusals', 'expiry'],
  },
  {
    id: 'external-proposal-commitment',
    capability: 'commit',
    callerAlreadyHas: ['external proposal', 'provider identity', 'bounded customer authority'],
    callerWants: 'Obtain provider acceptance without requiring an AE-generated route',
    requiredInput: ['external proposal', 'provider identity', 'bounded customer authority'],
    acceptableExit: ['provider commitment receipt', 'refusal', 'unknown effect'],
  },
  {
    id: 'external-commitment-inspection',
    capability: 'inspect',
    callerAlreadyHas: ['external commitment reference', 'provider identity'],
    callerWants: 'Read progress or completion evidence for work initiated outside AE',
    requiredInput: ['external commitment reference', 'provider identity'],
    acceptableExit: ['attributable progress', 'completion evidence', 'explicit unknown'],
  },
  {
    id: 'external-commitment-recovery',
    capability: 'recover',
    callerAlreadyHas: ['external commitment reference', 'failure or uncertainty'],
    callerWants: 'Reconcile, cancel, substitute, or return a bounded recovery plan',
    requiredInput: ['external commitment reference', 'failure or uncertainty'],
    acceptableExit: ['reconciled state', 'cancellation receipt', 'substitution options', 'return of control'],
  },
] as const

export const CURRENT_PARTIAL_ENTRY_SURFACES: readonly PartialEntrySurface[] = [
  {
    capability: 'discover',
    surface: 'registry.search / registry.detail',
    acceptedInput: ['search query', 'published business slug'],
    requiresAeLineage: [],
    output: ['published candidate businesses', 'published business facts'],
    currentMaturity: 'current',
  },
  {
    capability: 'qualify',
    surface: 'inquiry.submit',
    acceptedInput: ['named business slug', 'human inquiry message'],
    requiresAeLineage: [],
    output: ['qualified inquiry receipt', 'eventual human reply'],
    currentMaturity: 'current',
  },
  {
    capability: 'qualify',
    surface: 'Customer Request submit and options',
    acceptedInput: ['natural-language request', 'routing constraints'],
    requiresAeLineage: ['requestRef', 'request revision', 'AE capability interpretation'],
    output: ['AE-selected options', 'fit explanations'],
    currentMaturity: 'internal_or_target',
  },
  {
    capability: 'quote',
    surface: 'Customer Request options preparation',
    acceptedInput: ['requestRef', 'request revision'],
    requiresAeLineage: ['requestRef', 'request revision', 'AE-selected candidates', 'AE route generation'],
    output: ['prepared options', 'provider quote references'],
    currentMaturity: 'internal_or_target',
  },
  {
    capability: 'commit',
    surface: 'Customer Request confirmation',
    acceptedInput: ['requestRef', 'request revision', 'AE routeRef'],
    requiresAeLineage: ['requestRef', 'request revision', 'AE route generation', 'current AE routeRef'],
    output: ['bounded confirmation receipt'],
    currentMaturity: 'internal_or_target',
  },
  {
    capability: 'inspect',
    surface: 'Customer Request resume and evidence',
    acceptedInput: ['requestRef'],
    requiresAeLineage: ['requestRef', 'AE route or run'],
    output: ['request state', 'AE run progress', 'AE evidence'],
    currentMaturity: 'internal_or_target',
  },
  {
    capability: 'recover',
    surface: 'Customer Request cancel, problem, and reconciliation',
    acceptedInput: ['requestRef', 'AE problem or operation reference'],
    requiresAeLineage: ['requestRef', 'AE route or run'],
    output: ['cancellation state', 'problem receipt', 'reconciled AE run state'],
    currentMaturity: 'internal_or_target',
  },
] as const

const humanHandoffOutputs = new Set(['qualified inquiry receipt', 'eventual human reply'])

export function evaluatePartialEntry(
  cases: readonly PartialEntryCase[],
  surfaces: readonly PartialEntrySurface[],
): readonly PartialEntryResult[] {
  return cases.map((entryCase): PartialEntryResult => {
    const candidates = surfaces.filter((surface) => surface.capability === entryCase.capability)
    const direct = candidates.filter((surface) =>
      surface.currentMaturity === 'current'
      && surface.requiresAeLineage.length === 0
      && entryCase.requiredInput.every((input) => surface.acceptedInput.includes(input))
      && entryCase.acceptableExit.some((output) => surface.output.includes(output)),
    )
    if (direct.length > 0) {
      return {
        caseId: entryCase.id,
        capability: entryCase.capability,
        disposition: direct.some((surface) =>
          surface.output.some((output) => humanHandoffOutputs.has(output)))
          ? 'human_handoff_only'
          : 'independent_current',
        matchingSurfaces: direct.map(({ surface }) => surface),
        missingInputs: [],
        conclusion: 'The caller can obtain a bounded current result without creating AE lifecycle lineage.',
      }
    }

    const lineageMatches = candidates.filter((surface) =>
      surface.requiresAeLineage.length > 0
      && entryCase.acceptableExit.some((output) => surface.output.includes(output)),
    )
    if (lineageMatches.length > 0) {
      const accepted = new Set(lineageMatches.flatMap(({ acceptedInput }) => acceptedInput))
      return {
        caseId: entryCase.id,
        capability: entryCase.capability,
        disposition: 'ae_lineage_only',
        matchingSurfaces: lineageMatches.map(({ surface }) => surface),
        missingInputs: entryCase.requiredInput.filter((input) => !accepted.has(input)),
        conclusion: 'The machinery exists only after the caller enters an AE-owned Request, route, or run.',
      }
    }

    return {
      caseId: entryCase.id,
      capability: entryCase.capability,
      disposition: 'not_addressable',
      matchingSurfaces: candidates.map(({ surface }) => surface),
      missingInputs: [...entryCase.requiredInput],
      conclusion: 'No current surface accepts the caller state and returns the requested bounded result.',
    }
  })
}
