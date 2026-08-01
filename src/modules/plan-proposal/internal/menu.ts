import type { AnyAction } from '@/modules/actions'


export function buildCandidateMenu(
  stage: 'discover' | 'compare',
  actions: readonly AnyAction[],
): readonly AnyAction[] {
  return actions
    .filter((action) =>
      action.effect.class === 'observation' || action.effect.class === 'comparison_quote')
    .filter((action) => action.surfaces.includes('answerThread'))
    .filter((action) => stage === 'discover'
      ? /(?:search|list|detail|discover)/iu.test(action.id)
      : action.effect.class === 'comparison_quote' || /(?:detail|discover)/iu.test(action.id))
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, 7)
}
