import type { PublicDocumentationLinks } from '@/lib/documentation/public-documentation'
import type { ProblemKind } from '@/lib/errors'
import type { ExactAmount } from '@/modules/money/public'

export type DevelopersApiProblemKind = Exclude<ProblemKind, 'NO_DATA'>

export type DevelopersApiOperation = Readonly<{
  operationId: string
  method: string
  path: string
  summary: string
} & ({ curl: string; template?: never; authority?: never } | { curl?: never; template: string; authority: string })>

export type DevelopersApiOperationGroupTag =
  | 'Call gateway'
  | 'Tool market'
  | 'Funding'
  | 'Businesses'
  | 'Platform'
  | 'Account'
  | 'Market demand'
  | 'Provider'

export type DevelopersApiOperationGroup = Readonly<{
  tag: DevelopersApiOperationGroupTag
  operations: readonly DevelopersApiOperation[]
}>

export type DevelopersApiProblem = Readonly<{
  kind: DevelopersApiProblemKind
  type: string
  title: string
  nextStep: string
}>

export type DevelopersApiViewModel = Readonly<{
  documentation?: PublicDocumentationLinks
  authDescription: string
  documentVersion: string
  versionPolicy: string
  operationGroups: readonly DevelopersApiOperationGroup[]
  problems: readonly DevelopersApiProblem[]
  priceExample: Readonly<{
    shape: string
    json: string
    formatted: string
  }>
}>

export const DEVELOPERS_API_OPERATION_GROUP_TAGS = Object.freeze([
  'Call gateway',
  'Tool market',
  'Funding',
  'Businesses',
  'Platform',
  'Account',
  'Market demand',
  'Provider',
] as const satisfies readonly DevelopersApiOperationGroupTag[])

export const DEVELOPERS_API_COPY = Object.freeze({
  eyebrow: 'Developers',
  title: 'API reference',
  description: 'Search Tools, request a Quote, and make a Call.',
  setupHeading: 'Start with the contract',
  setupDescription: 'Use the published OpenAPI document for the complete machine-readable contract.',
  openApiLink: 'Open /openapi.json',
  versionLabel: 'Version',
  authenticationLabel: 'Authentication',
  priceShapeLabel: 'Price shape',
  operationsHeading: 'Requests',
  operationsDescription: 'Copy complete read requests where available. Other requests show required fields and authority, not a runnable command.',
  errorsHeading: 'Errors',
  errorsDescription: 'Error responses use RFC 9457 Problem Details. Match kind before deciding whether to retry.',
  nextStepLabel: 'Next step',
  problemTypeLabel: 'type',
  versionPolicy: (version: string) => `Breaking changes ship as a new version; current version ${version}.`,
  priceShape: 'Prices use ExactAmount { currency, units, exponent }.',
  priceExampleLabel: 'Example price',
})

export const DEVELOPERS_API_PRICE_EXAMPLE: ExactAmount = Object.freeze({
  currency: 'AUD',
  units: '1250000',
  exponent: 6,
})

export const DEVELOPERS_API_PROBLEM_NEXT_STEPS = Object.freeze({
  INVALID_ARGUMENT: 'Fix the named input fields, then send the request again.',
  FAILED_PRECONDITION: 'Refresh the referenced resource and meet the required state before retrying.',
  UNAUTHENTICATED: 'Connect again and send a current Agent access key.',
  PERMISSION_DENIED: 'Request the required Tool scope or use an Agent with access.',
  NOT_FOUND: 'Check the referenced Tool, Call, or Business identifier before retrying.',
  ALREADY_EXISTS: 'Read the recorded Call or Plan. Preserve its reference, original input and idempotency key; a duplicate response does not authorize a new purchase.',
  METHOD_NOT_ALLOWED: 'Use one of the methods shown for this endpoint.',
  PAYLOAD_TOO_LARGE: 'Reduce the request body size, then retry.',
  UNSUPPORTED_MEDIA_TYPE: 'Send JSON with Content-Type application/json.',
  RESOURCE_EXHAUSTED: 'Honour retry timing and account limits. For a submitted Call or Plan, read its recorded status before retrying with the same input and idempotency key.',
  UNAVAILABLE: 'After a Call or Plan submission, read its recorded status. If no reference was returned, recover the identity by repeating only the original command with the same input and idempotency key. An uncertain Call requires reconciliation before retrying; use only offered recovery actions.',
  INTERNAL: 'Do not assume completion or submit a fresh purchase. Read the recorded Call or Plan status; contact support with its reference and the request reference if the outcome remains uncertain.',
  UNKNOWN: 'Inspect the response detail and recorded Call or Plan status. Preserve the original idempotency key; an uncertain external effect requires recovery, not a fresh key.',
} satisfies Record<DevelopersApiProblemKind, string>)
