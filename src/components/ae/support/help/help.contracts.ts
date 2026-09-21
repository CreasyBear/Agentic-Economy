export const ISSUE_URL = 'https://github.com/CreasyBear/Agentic-Economy/issues/new/choose'
export const SUPPORT_EMAIL = 'mailto:support@aecon.ai'

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

export type SupportSearch = {
  callRef?: string
}

export type AeSupportHelpPageProps = Readonly<{
  canonicalBaseUrl: string
  callRef: string | undefined
}>

export type SupportHelpView = Readonly<{
  supportEmailHref: string
  diagnosticCommand: string
}>

export type ReferencedCallBannerProps = Readonly<{
  callRef: string
}>

export type AgentConnectionSectionProps = Readonly<{
  diagnosticCommand: string
}>
