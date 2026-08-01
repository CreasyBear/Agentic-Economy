import type {
  PublishedOperation,
  RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import { materializeRuntimePublishedOperation } from '@/modules/capability-supply/public'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import type {
  ActionInvocationOrigin,
  ActionInvocationView,
  InvocationActor,
  InvocationDecision,
} from './contracts'
import { dynamicPublishedSourceDigest, type DynamicPublishedInvocationResult } from './dynamic-published-contract'
import { dynamicPublishedOperationSlot, type DynamicPublishedSourcePort } from './dynamic-published-source'
import type { DevelopmentDurableState } from './internal/development-durable-port'
import type { DurableActionInvocationPort } from './internal/durable-contracts'
import {
  inspectUserInputContract,
  mergeUserInput,
  missingUserInput,
  type InvocationInputHistory,
  type InvocationInputWork,
} from './input-work'

type PrepareValue = (request: Readonly<{
  origin: ActionInvocationOrigin
  actor: InvocationActor
  value: StableHashValue
  freshnessMs: number
  continuation?: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    revise: boolean
  }>
}>) => ActionInvocationView<DynamicPublishedInvocationResult>

export function createDynamicPublishedInputApplication(input: Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  source: DynamicPublishedSourcePort
  durablePort: DurableActionInvocationPort<DynamicPublishedInvocationResult>
  durableState: DevelopmentDurableState<DynamicPublishedInvocationResult>
  work: Map<string, InvocationInputWork>
  history: InvocationInputHistory[]
  now: () => number
  nextInvocationRef: () => string
  prepareValue: PrepareValue
  inspect: (invocationRef: string) => ActionInvocationView<DynamicPublishedInvocationResult> | undefined
}>) {
  return {
    begin(request: Readonly<{
      origin: ActionInvocationOrigin
      actor: InvocationActor
      partial: Readonly<Record<string, StableHashValue>>
    }>): InvocationInputWork {
      const contract = inspectUserInputContract(input.operation)
      const current = input.source.current(dynamicPublishedOperationSlot(input.operation))
      if (current === undefined
        || dynamicPublishedSourceDigest(current, materializeRuntimePublishedOperation(current))
          !== contract.sourceMaterialDigest
        || current.readiness.validUntil <= input.now()) {
        throw new Error('published_operation_not_current')
      }
      const schema = input.descriptor.inputSchema as Record<string, any>
      const allowed = new Set(Object.keys(schema.properties ?? {}))
      if (Object.keys(request.partial).some((field) => !allowed.has(field))) {
        throw new Error('invocation_input_field_refused')
      }
      const invocationRef = input.nextInvocationRef()
      const missingFields = missingUserInput(contract.requiredFields, request.partial)
      const now = new Date(input.now()).toISOString()
      const row: InvocationInputWork = {
        invocationRef, invocationVersion: 1, origin: request.origin, owner: request.actor,
        state: 'gathering_information', operationId: input.operation.operationId,
        operationVersion: contract.descriptorVersion,
        sourceMaterialDigest: contract.sourceMaterialDigest,
        knownInput: { ...request.partial }, requiredFields: contract.requiredFields,
        missingFields, askedFields: missingFields, updatedAt: now,
      }
      const commandMaterial = { kind: 'begin', row } as unknown as StableHashValue
      const commandDigest = canonicalDigest(commandMaterial)
      const commandId = `${invocationRef}:create:begin_information`
      const result = input.durablePort.transact({
        commandId, commandDigest, expectedInvocationVersion: null,
        row: {
          invocationRef, invocationVersion: 1, sourceRef: invocationRef,
          control: {
            invocationRef, invocationVersion: 1, environment: 'MOCK/DEVELOPMENT ONLY',
            persistence: 'durable_control', origin: request.origin, owner: request.actor,
            action: { id: input.operation.operationId, contractVersion: input.descriptor.version },
            desired: { state: 'invoke' }, freshness: { state: 'not_observed' },
            control: { state: 'gathering_information', missingFields },
          },
          updatedAt: now,
        },
        history: {
          invocationRef, commandId, commandDigest, commandResult: 'applied',
          kind: 'begin_information',
        },
        canonicalCommandMaterial: commandMaterial,
      })
      if (result.kind === 'refused') throw new Error(`begin_information_refused:${result.code}`)
      input.work.set(invocationRef, row)
      input.history.push({
        invocationRef, invocationVersion: 1, kind: 'begin', commandDigest, recordedAt: now,
      })
      return row
    },
    answer(request: Readonly<{
      invocationRef: string
      actor: InvocationActor
      answers: Readonly<Record<string, StableHashValue>>
      freshnessMs: number
    }>): InvocationInputWork | ActionInvocationView<DynamicPublishedInvocationResult> {
      const current = input.work.get(request.invocationRef)
      if (current === undefined) throw new Error('invocation_information_not_found')
      if (current.owner.callerRef !== request.actor.callerRef
        || current.owner.principalRef !== request.actor.principalRef) {
        throw new Error('cross_principal_refused')
      }
      const knownInput = mergeUserInput({ current, answers: request.answers })
      const missingFields = missingUserInput(current.requiredFields, knownInput)
      const nextVersion = current.invocationVersion + 1
      const now = new Date(input.now()).toISOString()
      if (missingFields.length === 0) {
        const view = input.prepareValue({
          origin: current.origin, actor: current.owner, value: knownInput as StableHashValue,
          freshnessMs: request.freshnessMs,
          continuation: {
            invocationRef: current.invocationRef,
            expectedInvocationVersion: current.invocationVersion,
            revise: false,
          },
        })
        input.work.set(current.invocationRef, {
          ...current, invocationVersion: view.invocationVersion, state: 'prepared',
          knownInput, missingFields: [], updatedAt: now,
        })
        input.history.push({
          invocationRef: current.invocationRef, invocationVersion: view.invocationVersion,
          kind: 'prepare', commandDigest: canonicalDigest({
            invocationRef: current.invocationRef, knownInput,
          }), recordedAt: now,
        })
        return view
      }
      const next: InvocationInputWork = {
        ...current, invocationVersion: nextVersion, knownInput, missingFields,
        askedFields: [...new Set([...current.askedFields, ...missingFields])], updatedAt: now,
      }
      const commandMaterial = { kind: 'answer', current: current.invocationVersion, next }
      const commandDigest = canonicalDigest(commandMaterial as unknown as StableHashValue)
      const control = input.durableState.controls.get(current.invocationRef)
      if (control === undefined) throw new Error('invocation_control_not_found')
      const commandId = `${current.invocationRef}:${current.invocationVersion}:answer_information`
      const result = input.durablePort.transact({
        commandId, commandDigest, expectedInvocationVersion: current.invocationVersion,
        row: {
          ...control, invocationVersion: nextVersion,
          control: {
            ...control.control, invocationVersion: nextVersion,
            control: { state: 'gathering_information', missingFields },
          },
          updatedAt: now,
        },
        history: {
          invocationRef: current.invocationRef, commandId, commandDigest,
          commandResult: 'applied', kind: 'answer_information',
        },
        canonicalCommandMaterial: commandMaterial as unknown as StableHashValue,
      })
      if (result.kind === 'refused') throw new Error(`answer_information_refused:${result.code}`)
      input.work.set(current.invocationRef, next)
      input.history.push({
        invocationRef: current.invocationRef, invocationVersion: nextVersion,
        kind: 'answer', commandDigest, recordedAt: now,
      })
      return next
    },
    correct(request: Readonly<{
      invocationRef: string
      actor: InvocationActor
      corrections: Readonly<Record<string, StableHashValue>>
      freshnessMs: number
    }>): InvocationDecision<DynamicPublishedInvocationResult> {
      const view = input.inspect(request.invocationRef)
      const row = input.source.read(request.invocationRef)
      if (view === undefined || row === undefined) {
        return { kind: 'refused', code: 'invocation_not_found' }
      }
      if (view.owner.callerRef !== request.actor.callerRef
        || view.owner.principalRef !== request.actor.principalRef) {
        return { kind: 'refused', code: 'cross_principal_refused', view }
      }
      if ((view.control.state !== 'awaiting_authority' && view.control.state !== 'authorized')
        || view.attempts.length > 0) {
        return { kind: 'refused', code: 'invalid_control_state', view }
      }
      const contract = inspectUserInputContract(row.operation)
      const allowed = new Set(contract.requiredFields)
      if (Object.keys(request.corrections).some((field) => !allowed.has(field))) {
        return { kind: 'refused', code: 'material_input_changed', view }
      }
      const value = {
        ...(row.input.input as Record<string, StableHashValue>),
        ...request.corrections,
      }
      try {
        const next = input.prepareValue({
          origin: view.origin, actor: view.owner, value, freshnessMs: request.freshnessMs,
          continuation: {
            invocationRef: view.invocationRef,
            expectedInvocationVersion: view.invocationVersion,
            revise: true,
          },
        })
        input.work.set(view.invocationRef, {
          invocationRef: view.invocationRef, invocationVersion: next.invocationVersion,
          origin: view.origin, owner: view.owner, state: 'prepared',
          operationId: row.operation.operationId, operationVersion: input.descriptor.version,
          sourceMaterialDigest: dynamicPublishedSourceDigest(row.operation, input.descriptor),
          knownInput: value, requiredFields: contract.requiredFields, missingFields: [],
          askedFields: [], updatedAt: new Date(input.now()).toISOString(),
        })
        input.history.push({
          invocationRef: view.invocationRef,
          invocationVersion: next.invocationVersion,
          kind: 'correct',
          commandDigest: canonicalDigest({
            invocationRef: view.invocationRef,
            priorVersion: view.invocationVersion,
            knownInput: value,
          }),
          recordedAt: new Date(input.now()).toISOString(),
        })
        return { kind: 'accepted', view: next }
      } catch {
        return { kind: 'refused', code: 'material_input_changed', view }
      }
    },
    readInputWork: (invocationRef: string) => input.work.get(invocationRef),
  }
}
