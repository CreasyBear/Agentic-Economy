import type { ActionContext, ActionResult } from '../../../../src/modules/common/action'

import type {
  DevelopmentProviderToolCancellationInput,
  DevelopmentProviderToolInput,
} from './development-provider-tool.actions'

export type DevelopmentProviderToolDependencies = Readonly<{
  now?: () => number
  authorityPrincipalRef: string
  checkAvailability?: (
    input: DevelopmentProviderToolInput,
    now: number,
  ) => Promise<Readonly<{ kind: 'current' } | { kind: 'stale'; reason: string }>>
  execute?: (input: DevelopmentProviderToolInput) => Promise<ActionResult>
  checkCancellation?: (
    input: DevelopmentProviderToolCancellationInput,
  ) => Promise<Readonly<{ kind: 'current' } | { kind: 'refused'; reason: string }>>
  cancel?: (input: DevelopmentProviderToolCancellationInput) => Promise<ActionResult>
}>

const fixtureDependencies = new WeakMap<ActionContext, DevelopmentProviderToolDependencies>()

export function bindDevelopmentProviderToolContext(
  dependencies: DevelopmentProviderToolDependencies,
): ActionContext {
  const context: ActionContext = {}
  fixtureDependencies.set(context, Object.freeze({ ...dependencies }))
  return context
}

export function developmentProviderToolDependencies(
  context: ActionContext,
): DevelopmentProviderToolDependencies {
  const dependencies = fixtureDependencies.get(context)
  if (dependencies === undefined) {
    throw new Error('development_provider_operation_dependencies_unavailable')
  }
  return dependencies
}
