export type ComparisonPresentationProposal = Readonly<{
  semanticDigest: string
  mode: 'answer_first' | 'guided_compare'
  density: 'concise' | 'comfortable'
  responsiveComposition: 'answer_then_evidence' | 'guided_sections'
  emphasisIds: readonly string[]
}>

export type ComparisonPresentationAdapterResult =
  | Readonly<{ kind: 'proposed'; proposal: unknown }>
  | Readonly<{
      kind:
        | 'disabled'
        | 'timeout'
        | 'unavailable'
        | 'unsafe'
        | 'switched_model'
    }>

export type ComparisonPresentationAdapter = (
  input: Readonly<{
    semanticDigest: string
    allowedSemanticIds: readonly string[]
  }>,
) => Promise<ComparisonPresentationAdapterResult>
