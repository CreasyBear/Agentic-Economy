export const aeStatusValues = [
  'available',
  'claimed',
  'degraded',
  'failed',
  'guarded',
  'indexed',
  'listed',
  'not_live',
  'not_queued',
  'published',
  'queued',
  'registry_verified',
  'stale',
  'suppressed',
  'unavailable',
] as const

export type AeStatus = (typeof aeStatusValues)[number]
export type AeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export type AeStatusPresentation = {
  label: string
  tone: AeTone
  description: string
  nextAction?: string
  priority: 'low' | 'medium' | 'high'
}

export const aeStatusPresentation = {
  available: {
    label: 'Available',
    tone: 'success',
    description: 'This status is available from source-owned state.',
    priority: 'medium',
  },
  claimed: {
    label: 'Claimed',
    tone: 'success',
    description: 'An owner binding exists for this object.',
    priority: 'medium',
  },
  degraded: {
    label: 'Degraded',
    tone: 'warning',
    description: 'The object remains visible, but a repair path is needed.',
    nextAction: 'Review the readback and repair action.',
    priority: 'high',
  },
  failed: {
    label: 'Failed',
    tone: 'danger',
    description: 'The latest operation did not complete.',
    nextAction: 'Use the source-owned repair path.',
    priority: 'high',
  },
  guarded: {
    label: 'Guarded',
    tone: 'info',
    description: 'The foundation guardrails are running before product behavior ships.',
    priority: 'medium',
  },
  indexed: {
    label: 'Indexed',
    tone: 'success',
    description: 'The public projection has index readback.',
    priority: 'medium',
  },
  listed: {
    label: 'Listed',
    tone: 'neutral',
    description: 'The business is listed without additional registry evidence.',
    priority: 'low',
  },
  not_live: {
    label: 'Not live',
    tone: 'neutral',
    description: 'This capability is explicitly unavailable in the current phase.',
    priority: 'low',
  },
  not_queued: {
    label: 'Not queued',
    tone: 'neutral',
    description: 'No projection attempt has been queued yet.',
    priority: 'low',
  },
  published: {
    label: 'Published',
    tone: 'success',
    description: 'The source-owned page state is published.',
    priority: 'medium',
  },
  queued: {
    label: 'Queued',
    tone: 'info',
    description: 'A source-owned operation is waiting to run.',
    priority: 'medium',
  },
  registry_verified: {
    label: 'Registry verified',
    tone: 'success',
    description: 'Source evidence supports registry verification.',
    priority: 'medium',
  },
  stale: {
    label: 'Stale',
    tone: 'warning',
    description: 'Readback is older than the current source state.',
    nextAction: 'Regenerate from source state.',
    priority: 'high',
  },
  suppressed: {
    label: 'Suppressed',
    tone: 'danger',
    description: 'This object is not publicly available.',
    priority: 'high',
  },
  unavailable: {
    label: 'Unavailable',
    tone: 'neutral',
    description: 'This capability is not available from source-owned state.',
    priority: 'low',
  },
} satisfies Record<AeStatus, AeStatusPresentation>

export function getStatusPresentation(status: AeStatus): AeStatusPresentation {
  return aeStatusPresentation[status]
}

