export type AeSiteFaqItem = Readonly<{
  question: string
  answer: string
}>

export type AeSiteFaqProps = Readonly<{
  labelledBy: string
  questions: readonly AeSiteFaqItem[]
  title?: string
  statusLinkLead?: string
  statusLinkLabel?: string
}>
