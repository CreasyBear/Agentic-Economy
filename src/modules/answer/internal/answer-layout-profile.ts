import type { AnswerArtifact } from '../answer-schema'
import type { AnswerSynthesizerFollowUpIntent } from '../answer-synthesizer'

export const AnswerLayoutProfileValues = [
  'discovery_full',
  'data_answer',
  'clarification',
  'refinement_compact',
  'compare_pair',
  'boundary_explain',
  'safety_refusal',
  'empty_state',
] as const

export type AnswerLayoutProfile = (typeof AnswerLayoutProfileValues)[number]

export function computeLayoutProfile(input: {
  compactLayout?: boolean
  followUpIntent?: AnswerSynthesizerFollowUpIntent
  providerCount: number
}): AnswerLayoutProfile {
  if (input.followUpIntent === 'explain_boundary' || input.followUpIntent === 'unsupported') {
    return 'boundary_explain'
  }

  if (input.providerCount === 0) {
    return 'empty_state'
  }

  if (input.followUpIntent === 'compare_known' && input.providerCount >= 2) {
    return 'compare_pair'
  }

  if (input.compactLayout === true) {
    return 'refinement_compact'
  }

  return 'discovery_full'
}

export function resolveLayoutProfile(input: {
  layoutProfile?: AnswerLayoutProfile
  compactLayout?: boolean
  followUpIntent?: AnswerSynthesizerFollowUpIntent
  providerCount: number
}): AnswerLayoutProfile {
  if (input.layoutProfile !== undefined) {
    return input.layoutProfile
  }

  return computeLayoutProfile({
    ...(input.compactLayout === true ? { compactLayout: true } : {}),
    ...(input.followUpIntent === undefined ? {} : { followUpIntent: input.followUpIntent }),
    providerCount: input.providerCount,
  })
}

export function inferLayoutProfileFromArtifacts(input: {
  artifacts: readonly AnswerArtifact[]
  layoutProfile?: AnswerLayoutProfile
  busy: boolean
}): AnswerLayoutProfile {
  if (input.layoutProfile !== undefined) {
    return input.layoutProfile
  }

  const providerCards = input.artifacts.find((artifact) => artifact.kind === 'provider-cards')
  const providerCount =
    providerCards?.kind === 'provider-cards' ? providerCards.providers.length : 0

  if (input.busy) {
    return 'discovery_full'
  }

  return resolveLayoutProfile({
    compactLayout: !input.artifacts.some(
      (artifact) =>
        artifact.kind === 'location-map' ||
        (artifact.kind === 'prose' && artifact.block === 'summary'),
    ),
    providerCount,
  })
}

export function isCompactLayoutProfile(profile: AnswerLayoutProfile): boolean {
  return profile === 'refinement_compact'
    || profile === 'boundary_explain'
    || profile === 'safety_refusal'
    || profile === 'clarification'
}
