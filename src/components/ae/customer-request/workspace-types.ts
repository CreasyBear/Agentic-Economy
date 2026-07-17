import type { CustomerRequestProjection, CustomerRequestView } from '@/modules/customer-request/customer-projection'

export type SubmitResponse =
  | CustomerRequestProjection
  | Readonly<{ kind: 'refused'; reason: string }>
  | Readonly<{ error: string }>

export type WorkspaceState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'resuming' }>
  | Readonly<{ kind: 'submitting' }>
  | Readonly<{ kind: 'request'; projection: CustomerRequestView }>
  | Readonly<{ kind: 'comparing'; projection: CustomerRequestView }>
  | Readonly<{ kind: 'reviewing'; projection: CustomerRequestView; routeRef: string }>
  | Readonly<{ kind: 'confirming'; projection: CustomerRequestView; routeRef: string }>
  | Readonly<{ kind: 'refreshing'; projection: CustomerRequestView }>
  | Readonly<{
      kind: 'conflict'
      projection: CustomerRequestView
      reason: Extract<CustomerRequestProjection, { kind: 'conflict' }>['reason']
    }>
  | Readonly<{ kind: 'error'; message: string; authenticationRequired: boolean }>

export type ConversationTurn = Readonly<{ speaker: 'customer' | 'ae'; text: string }>

export type CustomerRoute = NonNullable<CustomerRequestView['decision']>['routes'][number]

export type CustomerClarification = NonNullable<CustomerRequestView['clarification']>

export type BrowserRequestIdentity = Readonly<{ requestRef: string; agentRef: string }>
