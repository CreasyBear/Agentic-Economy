export const ISSUE_URL = 'https://github.com/CreasyBear/Agentic-Economy/issues/new/choose'
export const SUPPORT_EMAIL = 'mailto:support@aecon.ai'
export const MALFORMED_CALL_REFERENCE_MESSAGE =
  'The Call reference in this link is not valid. Open Calls to find the right Call.'
export const OPEN_CALL_LABEL = 'Open this Call'
export const OPEN_CALLS_LABEL = 'Open Calls'

export const SUPPORT_FAQ_HEADING = 'Questions'
export const SUPPORT_FAQ_ITEMS = [
  {
    question: 'What should I do if a Call result is uncertain?',
    answer: 'The original Call shows its current status and next action. If the result is uncertain, check that Call before trying again.',
  },
  {
    question: 'What should I include in a support email?',
    answer: 'For account, billing, security or Call problems, email support@aecon.ai with what you expected, what happened and a safe request reference. Do not include credentials, raw inputs or private results.',
  },
  {
    question: 'What should I include in a security report?',
    answer: 'Email a description and steps to reproduce. Please leave out passwords, API keys and other people’s personal information.',
  },
  {
    question: 'Can I open a public developer issue?',
    answer: 'GitHub issues are public. Use them only for non-sensitive developer reports.',
  },
] as const

export type SupportCallRef =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'valid'; value: string }>
  | Readonly<{ kind: 'malformed' }>

export type SupportSearch = Readonly<{
  callRef: SupportCallRef
}>

export type AeSupportHelpPageProps = Readonly<{
  canonicalBaseUrl: string
  callRef: SupportCallRef
}>

export type SupportHelpView = Readonly<{
  supportEmailHref: string
  diagnosticCommand: string
}>

export type ReferencedCallBannerProps = Readonly<{
  callRef: string
}>

export type SupportStatusSectionProps = Readonly<{
  callRef: SupportCallRef
}>

export type AgentConnectionSectionProps = Readonly<{
  diagnosticCommand: string
}>
