import type { ActionResult } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type {
  DurableActionExecutionPort,
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
  commandMaterials: Map<string, import('@/modules/common/stable-hash').StableHashValue>
}

export function createDevelopmentDurableState<Result extends ActionResult>(): DevelopmentDurableState<Result> {
  return {
    controls: new Map(),
    attempts: new Map(),
    history: new Map(),
    commands: new Map(),
    commandMaterials: new Map(),
  }
}

export function createDevelopmentDurablePort<Result extends ActionResult>(
  state = createDevelopmentDurableState<Result>(),
  options: Readonly<{
    readHistoryCommand?: (executionRef: string, commandId: string) => DurableHistoryRow | undefined
  }> = {},
): DurableActionExecutionPort<Result> {
  const { controls, attempts, history, commands, commandMaterials } = state

  const transact = async (command: PersistControlCommand<Result>): Promise<PersistControlResult> => {
    const prior = commands.get(command.commandId)
    if (prior !== undefined) {
      return prior.digest === command.commandDigest
        ? { kind: 'duplicate', executionVersion: command.row.executionVersion }
        : { kind: 'refused', code: 'command_identity_conflict' }
    }
    const current = controls.get(command.row.executionRef)
    const currentVersion = current?.executionVersion ?? null
    if (currentVersion !== command.expectedExecutionVersion) {
      return { kind: 'refused', code: 'stale_execution_version' }
    }
    if (current !== undefined && command.row.executionVersion <= current.executionVersion) {
      return { kind: 'refused', code: 'stale_execution_version' }
    }
    if (
      command.expectedEffectGeneration !== undefined &&
      current?.currentEffectGeneration !== command.expectedEffectGeneration
    ) return { kind: 'refused', code: 'effect_generation_stale' }

    controls.set(command.row.executionRef, command.row)
    const rows = attempts.get(command.row.executionRef) ?? new Map()
    for (const attempt of command.currentAttemptWrite === undefined ? [] : [command.currentAttemptWrite]) {
      rows.set(attempt.attemptRef, attempt)
    }
    attempts.set(command.row.executionRef, rows)
    const entries = history.get(command.row.executionRef) ?? []
    entries.push({
      ...command.history,
      executionVersion: command.row.executionVersion,
      current: true,
      recordedAt: command.row.updatedAt,
    })
    history.set(command.row.executionRef, entries)
    const result = { kind: 'applied' as const, executionVersion: command.row.executionVersion }
    commands.set(command.commandId, { digest: command.commandDigest, result })
    if (command.canonicalCommandMaterial !== undefined) {
      commandMaterials.set(command.commandId, command.canonicalCommandMaterial)
    }
    return result
  }

  return {
    transact,
    async readControl(ref) {
      return controls.get(ref)
    },
    async readAttempts(ref, limit) {
      return [...(attempts.get(ref)?.values() ?? [])]
        .sort((a, b) => a.attemptNumber - b.attemptNumber).slice(0, Math.max(0, limit))
    },
    async readAttempt(ref, attemptRef) {
      return attempts.get(ref)?.get(attemptRef)
    },
    async readHistory(ref, afterVersion, limit) {
      return (history.get(ref) ?? [])
        .filter((row) => row.executionVersion > afterVersion)
        .slice(0, Math.max(0, limit))
    },
    async readHistoryCommand(ref, commandId) {
      return (options.readHistoryCommand ?? ((ref, commandId) =>
        (history.get(ref) ?? []).find((row) => row.commandId === commandId)))(ref, commandId)
    },
    async recordLateObservation(input) {
      const digest = canonicalDigest({
        invocationRef: input.executionRef,
        effectGeneration: input.effectGeneration,
        release: input.release,
        evidenceDigest: input.evidenceDigest,
        actorRef: input.actorRef,
        sourceEvidenceRef: input.sourceEvidenceRef,
      })
      const prior = commands.get(input.commandId)
      if (prior !== undefined) {
        return prior.digest === digest
          ? { kind: 'duplicate', executionVersion: controls.get(input.executionRef)?.executionVersion ?? 0 }
          : { kind: 'refused', code: 'command_identity_conflict' }
      }
      const current = controls.get(input.executionRef)
      if (current === undefined) return { kind: 'refused', code: 'stale_execution_version' }
      const entries = history.get(input.executionRef) ?? []
      entries.push({
        executionRef: input.executionRef,
        commandId: input.commandId,
        commandDigest: digest,
        commandResult: 'applied',
        executionVersion: current.executionVersion,
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
      history.set(input.executionRef, entries)
      const result = { kind: 'applied' as const, executionVersion: current.executionVersion }
      commands.set(input.commandId, { digest, result })
      return result
    },
  }
}
