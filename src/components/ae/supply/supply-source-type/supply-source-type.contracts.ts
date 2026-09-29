import type { ReactNode } from 'react'

import type { HttpsUrlPreflight } from '../supply-source-native-start-presentation'

export const SUPPLY_SOURCE_TYPE_COPY = {
  findingTools: 'Finding Tools…',
  required: 'Required',
  x402ResourceUrl: {
    description: 'AE reads payment facts from the live signed 402 response. Example: https://api.example.com/paid-operation.',
    placeholder: 'https://api.example.com/paid-operation',
  },
  httpsExample: {
    x402: 'https://api.example.com/paid-operation',
  },
  httpsPreflight: {
    insecure: 'Insecure HTTP URL detected. Agentic Economy requires secure HTTPS endpoints.',
    invalid: (example: string) => `Enter a valid HTTPS URL, for example ${example}.`,
    valid: 'Valid HTTPS endpoint format',
  },
} as const

export const URL_DISCOVER_DIAGNOSTICS = {
  invalid: {
    whatHappened: 'URL syntax is invalid.',
    financialImpact: 'A$0.00 affected. Tool discovery was blocked.',
    nextStep: 'Enter a complete public HTTPS URL.',
  },
  insecure: {
    whatHappened: 'The URL uses insecure HTTP.',
    financialImpact: 'A$0.00 affected. Tool discovery was blocked.',
    nextStep: 'Replace http:// with https:// and try again.',
  },
} as const

export function httpsDiscoverNextStep(example: string): string {
  return `Enter a complete public HTTPS URL, such as ${example}.`
}

export type UrlDiscoverDiagnostic = Readonly<{
  whatHappened: (typeof URL_DISCOVER_DIAGNOSTICS)[keyof typeof URL_DISCOVER_DIAGNOSTICS]['whatHappened']
  financialImpact: (typeof URL_DISCOVER_DIAGNOSTICS)[keyof typeof URL_DISCOVER_DIAGNOSTICS]['financialImpact']
  nextStep: string
}>

export type SupplySourceTypeSectionProps = Readonly<{
  resourceUrl: string
  x402Method?: 'GET' | 'POST' | undefined
  disabled: boolean
  discovering: boolean
  onResourceUrlChange: (value: string) => void
  onX402MethodChange: (value: 'GET' | 'POST') => void
  onDiscover: () => void
}>

export type SupplySourceFieldsProps = Pick<
  SupplySourceTypeSectionProps,
  'resourceUrl' | 'x402Method' | 'disabled' | 'onResourceUrlChange' | 'onX402MethodChange'
> & Readonly<{
  askMethod?: boolean
  discoverDiagnostic?: UrlDiscoverDiagnostic | undefined
}>

export type UrlFieldWithPreflightProps = Readonly<{
  id: string
  label: string
  value: string
  description: string
  placeholder: string
  disabled: boolean
  discoverDiagnostic?: UrlDiscoverDiagnostic | undefined
  example: string
  onChange: (value: string) => void
}>

export type PreflightSlotProps = Readonly<{ children: ReactNode }>
export type HttpsUrlPreflightBadgeProps = Readonly<{ status: HttpsUrlPreflight }>
export type PreflightRule4AlertProps = Readonly<{ diagnostic: UrlDiscoverDiagnostic }>
