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
    body: 'Search the catalogue by capability, category, supplier, or task.',
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

export const termsItems = [
  {
    icon: StoreIcon,
    title: 'The exact Tool sets the terms',
    body: 'Its current contract, supplier, price, readiness, inputs, and access requirements govern the call.',
  },
  {
    icon: CreditCardIcon,
    title: 'Payment is not proof of delivery',
    body: 'A charge records payment activity. Completion and Qualified Use require their own named evidence.',
  },
  {
    icon: RefreshCcwIcon,
    title: 'Replay cannot create a second call or charge',
    body: 'A repeated idempotent request returns the recorded invocation outcome. Uncertain releases follow the recovery and reconciliation rules shown on the Tool.',
  },
] as const satisfies ReadonlyArray<TermsItem>

export type TermsCapabilityListProps = Readonly<{
  items: ReadonlyArray<TermsItem>
}>

export type TermsPracticeAccordionProps = Readonly<{
  items: ReadonlyArray<TermsItem>
}>
