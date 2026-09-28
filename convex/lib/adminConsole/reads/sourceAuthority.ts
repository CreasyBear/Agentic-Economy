import type { Doc } from '../../../_generated/dataModel'

/** Absent legacy authority is not evidence of a requested or completed review. */
export function readSourceAuthorityState(publication: Pick<Doc<'capabilityPublications'>, 'sourceAuthorityState'>): 'verified' | 'review_required' | 'unset' {
  return publication.sourceAuthorityState ?? 'unset'
}
