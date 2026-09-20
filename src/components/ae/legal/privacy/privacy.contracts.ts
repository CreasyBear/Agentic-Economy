import type { LucideIcon } from 'lucide-react'
import {
  BracesIcon,
  CreditCardIcon,
  EyeOffIcon,
  KeyRoundIcon,
  ReceiptTextIcon,
  SearchIcon,
  StoreIcon,
} from 'lucide-react'

export type PrivacyDetailCard = Readonly<{
  icon: LucideIcon
  label: string
  title: string
  body: string
}>

export type PrivacyMoment = Readonly<{
  value: string
  label: string
  icon: LucideIcon
  title: string
  points: ReadonlyArray<string>
}>

export const detailCards = [
  {
    icon: BracesIcon,
    label: 'Call',
    title: 'Inputs go to the selected Provider',
    body: 'Only the inputs required by the exact Tool are released through its published Call path.',
  },
  {
    icon: ReceiptTextIcon,
    label: 'Record',
    title: 'Execution facts support recovery',
    body: 'AE records Call identity, status, usage, settlement, delivery observations, and named evidence needed for recovery.',
  },
  {
    icon: EyeOffIcon,
    label: 'Public page',
    title: 'Private call data stays off market pages',
    body: 'Public catalogue and metrics pages do not expose credentials, raw inputs, outputs, or wallet counterparties.',
  },
] as const satisfies ReadonlyArray<PrivacyDetailCard>

export const moments = [
  {
    value: 'call',
    label: 'Call',
    icon: KeyRoundIcon,
    title: 'When an agent calls a Tool',
    points: ['The exact Tool defines its inputs, Provider, price, and access requirements.', 'AE checks identity, authority, and available spend before a controlled Call.', 'The Provider receives only the data released for that Tool.'],
  },
  {
    value: 'browse',
    label: 'Browse',
    icon: SearchIcon,
    title: 'When you browse the catalogue',
    points: ['Search and filter choices are used to return matching Tools.', 'Provider pages show published catalogue facts and their freshness.', 'Ratings, latency, popularity, or readiness are shown only when the market has a named source for them.'],
  },
  {
    value: 'money',
    label: 'Money',
    icon: CreditCardIcon,
    title: 'When a metered call may cost money',
    points: ['The exact price and currency are presented before the Call.', 'AE may reserve funds before contacting the Provider.', 'The observed cost is settled, or the reservation is released; uncertain outcomes enter reconciliation.'],
  },
  {
    value: 'publish',
    label: 'Publish',
    icon: StoreIcon,
    title: 'When a Provider publishes',
    points: ['Provider identity, published listings, Tool contracts, prices, readiness, and access facts become catalogue data.', 'Credentials and internal adapter configuration are not part of the public projection.', 'Providers can request a correction or removal through the process below.'],
  },
] as const satisfies ReadonlyArray<PrivacyMoment>

export type PrivacyDetailCardsProps = Readonly<{
  cards: ReadonlyArray<PrivacyDetailCard>
}>

export type PrivacyMomentTabsProps = Readonly<{
  moments: ReadonlyArray<PrivacyMoment>
}>
