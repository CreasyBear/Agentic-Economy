import type { ActionResult } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type {
  DurableActionInvocationPort,
  DurableAttemptRow,
  DurableControlRow,
  DurableHistoryRow,
  PersistControlCommand,
  PersistControlResult,
} from './durable-contracts'

/**
 * Transactional development double for the Convex port. Each method models one
 * mutation transaction; it performs indexed-key lookups and bounded reads.
 */
export type DevelopmentDurableState<Result extends ActionResult> = {
  controls: Map<string, DurableControlRow<Result>>
  attempts: Map<string, Map<string, DurableAttemptRow>>
  history: Map<string, DurableHistoryRow[]>
  commands: Map<string, Readonly<{ digest: string; result: PersistControlResult }>>
}

export function createDevelopmentDurableState<Result extends ActionResult>(): DevelopmentDurableState<Result> {
  return { controls: new Map(), attempts: new Map(), history: new Map(), commands: new Map() }
}

export function createDevelopmentDurablePort<Result extends ActionResult>(
  state = createDevelopmentDurableState<Result>(),
): DurableActionInvocationPort<Result> {
  const { controls, attempts, history, commands } = state

  const transact = (command: PersistControlCommand<Result>): PersistControlResult => {
    const prior = commands.get(command.commandId)
    if (prior !== undefined) {
      return prior.digest === command.commandDigest
        ? { kind: 'duplicate', invocationVersion: command.row.invocationVersion }
        : { kind: 'refused', code: 'command_identity_conflict' }
    }
    const current = controls.get(command.row.invocationRef)
    const currentVersion = current?.invocationVersion ?? null
    if (currentVersion !== command.expectedInvocationVersion) {
      return { kind: 'refused', code: 'stale_invocation_version' }
    }
    if (
      command.expectedEffectGeneration !== undefined &&
      current?.currentEffectGeneration !== command.expectedEffectGeneration
    ) return { kind: 'refused', code: 'effect_generation_stale' }

    controls.set(command.row.invocationRef, command.row)
    const rows = attempts.get(command.row.invocationRef) ?? new Map()
    for (const attempt of command.newAttempt === undefined ? [] : [command.newAttempt]) {
      if (!rows.has(attempt.attemptRef)) rows.set(attempt.attemptRef, attempt)
    }
    attempts.set(command.row.invocationRef, rows)
    const entries = history.get(command.row.invocationRef) ?? []
    entries.push({
      ...command.history,
      invocationVersion: command.row.invocationVersion,
      current: true,
      recordedAt: command.row.updatedAt,
    })
    history.set(command.row.invocationRef, entries)
    const result = { kind: 'applied' as const, invocationVersion: command.row.invocationVersion }
    commands.set(command.commandId, { digest: command.commandDigest, result })
    return result
  }

  return {
    transact,
    readControl: (ref) => controls.get(ref),
    readAttempts: (ref, limit) => [...(attempts.get(ref)?.values() ?? [])]
      .sort((a, b) => a.attemptNumber - b.attemptNumber).slice(0, Math.max(0, limit)),
    readHistory: (ref, afterVersion, limit) => (history.get(ref) ?? [])
      .filter((row) => row.invocationVersion > afterVersion)
      .slice(0, Math.max(0, limit)),
    readHistoryCommand: (ref, commandId) =>
      (history.get(ref) ?? []).find((row) => row.commandId === commandId),
    recordLateObservation(input) {
      const digest = canonicalDigest({
        invocationRef: input.invocationRef,
        effectGeneration: input.effectGeneration,
        release: input.release,
        evidenceDigest: input.evidenceDigest,
        actorRef: input.actorRef,
        sourceEvidenceRef: input.sourceEvidenceRef,
      })
      const prior = commands.get(input.commandId)
      if (prior !== undefined) {
        return prior.digest === digest
          ? { kind: 'duplicate', invocationVersion: controls.get(input.invocationRef)?.invocationVersion ?? 0 }
          : { kind: 'refused', code: 'command_identity_conflict' }
      }
      const current = controls.get(input.invocationRef)
      if (current === undefined) return { kind: 'refused', code: 'stale_invocation_version' }
      const entries = history.get(input.invocationRef) ?? []
      entries.push({
        invocationRef: input.invocationRef,
        commandId: input.commandId,
        commandDigest: digest,
        commandResult: 'applied',
        invocationVersion: current.invocationVersion,
        effectGeneration: input.effectGeneration,
        kind: 'late_observation',
        current: false,
        actorRef: input.actorRef,
        sourceEvidenceRef: input.sourceEvidenceRef,
        observation: {
          kind: 'release_observation',
          release: input.release,
          evidenceDigest: input.evidenceDigest,
        },
        recordedAt: input.recordedAt,
      })
      history.set(input.invocationRef, entries)
      const result = { kind: 'applied' as const, invocationVersion: current.invocationVersion }
      commands.set(input.commandId, { digest, result })
      return result
    },
  }
}
