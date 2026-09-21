import type { ProblemKind } from '@/lib/errors'
import type { ExactAmount } from '@/modules/money/public'

export type DevelopersApiProblemKind = Exclude<ProblemKind, 'NO_DATA'>

export type DevelopersApiOperation = Readonly<{
  operationId: string
  method: string
  path: string
  summary: string
  curl: string
}>

export type DevelopersApiProblem = Readonly<{
  kind: DevelopersApiProblemKind
  type: string
  title: string
  nextStep: string
}>

export type DevelopersApiViewModel = Readonly<{
  authDescription: string
  documentVersion: string
  versionPolicy: string
  operations: readonly DevelopersApiOperation[]
  problems: readonly DevelopersApiProblem[]
  priceExample: Readonly<{
    shape: string
    json: string
    formatted: string
  }>
}>

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
  operationsDescription: 'Copy a request and replace any placeholder values for the job.',
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
  ALREADY_EXISTS: 'Read the existing Call before deciding whether another request is needed.',
  METHOD_NOT_ALLOWED: 'Use one of the methods shown for this endpoint.',
  PAYLOAD_TOO_LARGE: 'Reduce the request body size, then retry.',
  UNSUPPORTED_MEDIA_TYPE: 'Send JSON with Content-Type application/json.',
  RESOURCE_EXHAUSTED: 'Wait, then retry within the account limits.',
  UNAVAILABLE: 'Check system status and retry after recovery.',
  INTERNAL: 'Do not assume completion. Contact support with the request reference.',
  UNKNOWN: 'Do not retry blindly. Inspect the response detail and request reference.',
} satisfies Record<DevelopersApiProblemKind, string>)
