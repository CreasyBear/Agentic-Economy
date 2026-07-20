import type { ActionContext, ActionResult } from '../../../../src/modules/common/action'

import type {
  DevelopmentProviderOperationCancellationInput,
  DevelopmentProviderOperationInput,
} from './development-provider-operation.actions'

export type DevelopmentProviderOperationDependencies = Readonly<{
  now?: () => number
  authorityPrincipalRef: string
  checkAvailability?: (
    input: DevelopmentProviderOperationInput,
    now: number,
  ) => Promise<Readonly<{ kind: 'current' } | { kind: 'stale'; reason: string }>>
  execute?: (input: DevelopmentProviderOperationInput) => Promise<ActionResult>
  checkCancellation?: (
    input: DevelopmentProviderOperationCancellationInput,
  ) => Promise<Readonly<{ kind: 'current' } | { kind: 'refused'; reason: string }>>
  cancel?: (input: DevelopmentProviderOperationCancellationInput) => Promise<ActionResult>
}>

const fixtureDependencies = new WeakMap<ActionContext, DevelopmentProviderOperationDependencies>()

export function bindDevelopmentProviderOperationContext(
  dependencies: DevelopmentProviderOperationDependencies,
): ActionContext {
  const context: ActionContext = {}
  fixtureDependencies.set(context, Object.freeze({ ...dependencies }))
  return context
}

export function developmentProviderOperationDependencies(
  context: ActionContext,
): DevelopmentProviderOperationDependencies {
  const dependencies = fixtureDependencies.get(context)
  if (dependencies === undefined) {
    throw new Error('development_provider_operation_dependencies_unavailable')
  }
  return dependencies
}
