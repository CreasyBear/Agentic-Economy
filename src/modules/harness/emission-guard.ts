import { canonicalDigest } from '@/modules/common/canonical-digest'

export const HarnessEmissionSeverityValues = [
  'info',
  'warning',
  'error',
  'blocker',
] as const

export type HarnessEmissionSeverity = (typeof HarnessEmissionSeverityValues)[number]

export const HarnessEmissionSurfaceValues = [
  'private',
  'admin',
  'public',
] as const

export type HarnessEmissionSurface = (typeof HarnessEmissionSurfaceValues)[number]
export type HarnessPrivateEmissionSurface = Exclude<HarnessEmissionSurface, 'public'>

export type HarnessEmissionEvidenceKind =
  | 'sourceFact'
  | 'toolResult'
  | 'gateDecision'
  | 'modelMessage'
  | 'runEvent'
  | 'code'
  | 'test'
  | 'other'

export type HarnessEmissionEvidenceReference = {
  kind: HarnessEmissionEvidenceKind
  ref: string
}

export type HarnessEmissionSuppressionReason =
  | 'empty'
  | 'filler'
  | 'duplicate'
  | 'cycle_limit'
  | 'below_severity_threshold'
  | 'public_surface'
  | 'missing_evidence'

export type HarnessAcceptedEmission = {
  schemaVersion: 1
  kind: 'harnessReviewerEmission'
  sensitivity: 'private'
  noteHash: string
  text: string
  severity: HarnessEmissionSeverity
  surface: HarnessPrivateEmissionSurface
  evidence: readonly HarnessEmissionEvidenceReference[]
  cycle: number
  escalatedFrom?: HarnessEmissionSeverity
}

export type HarnessSuppressedEmissionCounter = {
  schemaVersion: 1
  kind: 'suppressedHarnessEmission'
  noteHash: string
  count: number
  reasons: readonly HarnessEmissionSuppressionReason[]
  firstCycle: number
  lastCycle: number
  highestSeverity: HarnessEmissionSeverity
  lastReason: HarnessEmissionSuppressionReason
}

export type HarnessEmissionGuardAcceptedDecision = {
  accepted: true
  reason: 'accepted' | 'severity_escalation'
  emission: HarnessAcceptedEmission
}

export type HarnessEmissionGuardSuppressedDecision = {
  accepted: false
  reason: HarnessEmissionSuppressionReason
  suppression: HarnessSuppressedEmissionCounter
}

export type HarnessEmissionGuardDecision =
  | HarnessEmissionGuardAcceptedDecision
  | HarnessEmissionGuardSuppressedDecision

export type HarnessEmissionGuardInput = {
  text: string
  severity: HarnessEmissionSeverity
  evidence?: readonly HarnessEmissionEvidenceReference[]
  surface?: HarnessEmissionSurface
}

export type HarnessEmissionGuardOptions = {
  minimumSeverity?: HarnessEmissionSeverity
  maxAcceptedPerCycle?: number
  historyCapacity?: number
  suppressedCapacity?: number
}

export type HarnessEmissionGuardSnapshot = {
  schemaVersion: 1
  minimumSeverity: HarnessEmissionSeverity
  maxAcceptedPerCycle: number
  cycle: number
  acceptedThisCycle: number
  suppressed: {
    total: number
    notes: readonly HarnessSuppressedEmissionCounter[]
  }
}

type AcceptedNoteState = {
  noteHash: string
  highestSeverity: HarnessEmissionSeverity
}

type MutableSuppressedCounter = Omit<HarnessSuppressedEmissionCounter, 'reasons'> & {
  reasons: HarnessEmissionSuppressionReason[]
}

const DEFAULT_HISTORY_CAPACITY = 4096
const DEFAULT_SUPPRESSED_CAPACITY = 4096

const DEFAULT_MINIMUM_SEVERITY: HarnessEmissionSeverity = 'warning'

const SEVERITY_RANK: Record<HarnessEmissionSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  blocker: 3,
}

const SUPPRESSED_NORMALIZED_PHRASES: Record<string, true> = {
  stop: true,
  'stop here': true,
  'stop now': true,
  halt: true,
  abort: true,
  done: true,
  'task done': true,
  'task complete': true,
  complete: true,
  finished: true,
  ok: true,
  okay: true,
  'ok done': true,
  'no issue': true,
  'no issues': true,
  'no issue continue': true,
  'no concerns': true,
  'no concern': true,
  'nothing to add': true,
  'nothing to flag': true,
  'nothing to report': true,
  'no notes': true,
  'no further input': true,
  'no further input needed': true,
  'no further input required': true,
  'no further watcher input': true,
  'no further watcher input needed': true,
  'no further advice': true,
  'no further advice needed': true,
  lgtm: true,
  'looks good': true,
  'all good': true,
  'agent is on track': true,
  'agent on track': true,
  'on track': true,
  continue: true,
  'carry on': true,
}

export function normalizeHarnessEmissionText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function hashHarnessEmissionNote(text: string): string {
  return hashNormalizedEmissionText(normalizeHarnessEmissionText(text))
}

export function compareHarnessEmissionSeverity(
  left: HarnessEmissionSeverity,
  right: HarnessEmissionSeverity,
): number {
  return SEVERITY_RANK[left] - SEVERITY_RANK[right]
}

export class HarnessEmissionGuard {
  private readonly minimumSeverity: HarnessEmissionSeverity
  private readonly maxAcceptedPerCycle: number
  private readonly historyCapacity: number
  private readonly suppressedCapacity: number
  private readonly acceptedByHash = new Map<string, AcceptedNoteState>()
  private readonly suppressedByHash = new Map<string, MutableSuppressedCounter>()
  private cycle = 0
  private acceptedThisCycle = 0

  constructor(options: HarnessEmissionGuardOptions = {}) {
    this.minimumSeverity = options.minimumSeverity ?? DEFAULT_MINIMUM_SEVERITY
    this.maxAcceptedPerCycle = normalizeCapacity(options.maxAcceptedPerCycle ?? 1, 0)
    this.historyCapacity = normalizeCapacity(options.historyCapacity ?? DEFAULT_HISTORY_CAPACITY, 1)
    this.suppressedCapacity = normalizeCapacity(options.suppressedCapacity ?? DEFAULT_SUPPRESSED_CAPACITY, 1)
  }

  reset(): void {
    this.acceptedByHash.clear()
    this.suppressedByHash.clear()
    this.cycle = 0
    this.acceptedThisCycle = 0
  }

  beginCycle(): void {
    this.cycle += 1
    this.acceptedThisCycle = 0
  }

  evaluate(input: HarnessEmissionGuardInput): HarnessEmissionGuardDecision {
    const normalizedText = normalizeHarnessEmissionText(input.text)
    const noteHash = hashNormalizedEmissionText(normalizedText)
    const surface = input.surface ?? 'private'

    if (!normalizedText) {
      return this.suppress(noteHash, 'empty', input.severity)
    }

    if (surface === 'public') {
      return this.suppress(noteHash, 'public_surface', input.severity)
    }

    if (SUPPRESSED_NORMALIZED_PHRASES[normalizedText]) {
      return this.suppress(noteHash, 'filler', input.severity)
    }

    if (compareHarnessEmissionSeverity(input.severity, this.minimumSeverity) < 0) {
      return this.suppress(noteHash, 'below_severity_threshold', input.severity)
    }

    const evidence = normalizeEvidenceReferences(input.evidence)
    if (evidence.length === 0) {
      return this.suppress(noteHash, 'missing_evidence', input.severity)
    }

    const prior = this.acceptedByHash.get(noteHash)
    const escalatedFrom = prior?.highestSeverity
    const isSeverityEscalation = prior !== undefined
      && compareHarnessEmissionSeverity(input.severity, prior.highestSeverity) > 0

    if (prior !== undefined && !isSeverityEscalation) {
      return this.suppress(noteHash, 'duplicate', input.severity)
    }

    if (this.acceptedThisCycle >= this.maxAcceptedPerCycle) {
      return this.suppress(noteHash, 'cycle_limit', input.severity)
    }

    this.acceptedThisCycle += 1
    this.recordAccepted(noteHash, input.severity)

    return {
      accepted: true,
      reason: isSeverityEscalation ? 'severity_escalation' : 'accepted',
      emission: {
        schemaVersion: 1,
        kind: 'harnessReviewerEmission',
        sensitivity: 'private',
        noteHash,
        text: input.text,
        severity: input.severity,
        surface,
        evidence,
        cycle: this.cycle,
        ...(isSeverityEscalation && escalatedFrom !== undefined ? { escalatedFrom } : {}),
      },
    }
  }

  snapshot(): HarnessEmissionGuardSnapshot {
    const notes = [...this.suppressedByHash.values()]
      .map(copySuppressedCounter)
      .sort((left, right) => left.noteHash.localeCompare(right.noteHash))

    return {
      schemaVersion: 1,
      minimumSeverity: this.minimumSeverity,
      maxAcceptedPerCycle: this.maxAcceptedPerCycle,
      cycle: this.cycle,
      acceptedThisCycle: this.acceptedThisCycle,
      suppressed: {
        total: notes.reduce((total, note) => total + note.count, 0),
        notes,
      },
    }
  }

  private recordAccepted(noteHash: string, severity: HarnessEmissionSeverity): void {
    const prior = this.acceptedByHash.get(noteHash)

    if (prior === undefined) {
      this.acceptedByHash.set(noteHash, { noteHash, highestSeverity: severity })
      this.evictAcceptedHistory()
      return
    }

    if (compareHarnessEmissionSeverity(severity, prior.highestSeverity) > 0) {
      this.acceptedByHash.set(noteHash, { noteHash, highestSeverity: severity })
    }
  }

  private suppress(
    noteHash: string,
    reason: HarnessEmissionSuppressionReason,
    severity: HarnessEmissionSeverity,
  ): HarnessEmissionGuardSuppressedDecision {
    const existing = this.suppressedByHash.get(noteHash)

    if (existing === undefined) {
      const next: MutableSuppressedCounter = {
        schemaVersion: 1,
        kind: 'suppressedHarnessEmission',
        noteHash,
        count: 1,
        reasons: [reason],
        firstCycle: this.cycle,
        lastCycle: this.cycle,
        highestSeverity: severity,
        lastReason: reason,
      }
      this.suppressedByHash.set(noteHash, next)
      this.evictSuppressedHistory()
      return {
        accepted: false,
        reason,
        suppression: copySuppressedCounter(next),
      }
    }

    existing.count += 1
    existing.lastCycle = this.cycle
    existing.lastReason = reason
    if (!existing.reasons.includes(reason)) {
      existing.reasons.push(reason)
    }
    if (compareHarnessEmissionSeverity(severity, existing.highestSeverity) > 0) {
      existing.highestSeverity = severity
    }

    return {
      accepted: false,
      reason,
      suppression: copySuppressedCounter(existing),
    }
  }

  private evictAcceptedHistory(): void {
    while (this.acceptedByHash.size > this.historyCapacity) {
      const stale = this.acceptedByHash.keys().next().value
      if (stale !== undefined) {
        this.acceptedByHash.delete(stale)
      }
    }
  }

  private evictSuppressedHistory(): void {
    while (this.suppressedByHash.size > this.suppressedCapacity) {
      const stale = this.suppressedByHash.keys().next().value
      if (stale !== undefined) {
        this.suppressedByHash.delete(stale)
      }
    }
  }
}

function normalizeEvidenceReferences(
  evidence: readonly HarnessEmissionEvidenceReference[] | undefined,
): readonly HarnessEmissionEvidenceReference[] {
  if (evidence === undefined) {
    return []
  }

  return evidence.flatMap((reference) => {
    const ref = reference.ref.trim()
    return ref.length === 0
      ? []
      : [{ kind: reference.kind, ref }]
  })
}

function copySuppressedCounter(counter: MutableSuppressedCounter): HarnessSuppressedEmissionCounter {
  return {
    schemaVersion: 1,
    kind: 'suppressedHarnessEmission',
    noteHash: counter.noteHash,
    count: counter.count,
    reasons: [...counter.reasons],
    firstCycle: counter.firstCycle,
    lastCycle: counter.lastCycle,
    highestSeverity: counter.highestSeverity,
    lastReason: counter.lastReason,
  }
}

function hashNormalizedEmissionText(normalizedText: string): string {
  return canonicalDigest({
    schemaVersion: 1,
    kind: 'harnessEmissionNote',
    normalizedText,
  }).toString()
}

function normalizeCapacity(value: number, minimum: number): number {
  return Math.max(minimum, Math.floor(value))
}
