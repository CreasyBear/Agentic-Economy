export const ISSUE_URL = 'https://github.com/CreasyBear/Agentic-Economy/issues/new/choose'
export const SUPPORT_EMAIL = 'mailto:support@aecon.ai'

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
