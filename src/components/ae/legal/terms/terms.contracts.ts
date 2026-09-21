import type { LucideIcon } from 'lucide-react'
import {
  BracesIcon,
  CreditCardIcon,
  GitCompareIcon,
  RefreshCcwIcon,
  SearchIcon,
  StoreIcon,
} from 'lucide-react'

export type TermsItem = Readonly<{
  icon: LucideIcon
  title: string
  body: string
}>

export const canDoItems = [
  {
    icon: SearchIcon,
    title: 'Find a Tool',
    body: 'Search the catalogue by capability, category, Provider, or task.',
  },
  {
    icon: GitCompareIcon,
    title: 'Compare exact offers',
    body: 'Review price, readiness, access, evidence, and measured facts where they exist.',
  },
  {
    icon: BracesIcon,
    title: 'Call through one boundary',
    body: 'Inspect the exact contract and approve its access and spend requirements before invoking.',
  },
] as const satisfies ReadonlyArray<TermsItem>

export type TermsPracticeItem = TermsItem & Readonly<{
  id: string
}>

export const termsPracticeSection = {
  id: 'terms-in-practice',
  title: 'What these terms mean in practice',
} as const

// Source: `git log -1 --format=%cs -- src/components/ae/legal/terms/terms.contracts.ts` returned 2026-09-20.
export const termsLastUpdated = 'Last updated 20 September 2026'
export const termsTableOfContentsHeading = 'On this page'
export const termsTableOfContentsLabel = 'Terms sections'

export const termsItems = [
  {
    id: 'terms-tool-rules',
    icon: StoreIcon,
    title: 'The exact Tool sets the terms',
    body: 'Its current contract, supplier, price, readiness, inputs, and access requirements govern the call.',
  },
  {
    id: 'terms-payment-evidence',
    icon: CreditCardIcon,
    title: 'Payment is not proof of delivery',
    body: 'A charge records payment activity. Completion and Qualified Use require their own named evidence.',
  },
  {
    id: 'terms-replay',
    icon: RefreshCcwIcon,
    title: 'Replay cannot create a second call or charge',
    body: 'A repeated idempotent request returns the recorded invocation outcome. Uncertain releases follow the recovery and reconciliation rules shown on the Tool.',
  },
] as const satisfies ReadonlyArray<TermsPracticeItem>

export const termsTableOfContents = [
  termsPracticeSection,
  ...termsItems.map(({ id, title }) => ({ id, title })),
] as const

export type TermsCapabilityListProps = Readonly<{
  items: ReadonlyArray<TermsItem>
}>

export type TermsPracticeAccordionProps = Readonly<{
  items: ReadonlyArray<TermsPracticeItem>
}>
