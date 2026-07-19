import type {
  DevelopmentInvocationApplication,
  DevelopmentInvocationHost,
} from '../application-service'
import type { InvocationActor } from '../contracts'

export function createRequestOwnedDevelopmentHost(input: Readonly<{
  application: DevelopmentInvocationApplication
  actor: InvocationActor
  requestRef: string
  revision: number
}>): DevelopmentInvocationHost {
  return input.application.bindRequestOwned(input)
}

export function createStandaloneAgentDevelopmentHost(input: Readonly<{
  application: DevelopmentInvocationApplication
  actor: InvocationActor
}>): DevelopmentInvocationHost {
  return input.application.bindStandalone(input)
}
