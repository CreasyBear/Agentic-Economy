import { getStatusPresentation } from '@/lib/ui/status-presentation'

export type DeveloperDiscoveryBadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export type DeveloperDiscoveryRow = Readonly<{
  id: string
  label: string
  state: string
  description?: string
}>

export type DeveloperDiscoveryArtifactRow = Readonly<{
  kind: string
  label: string
  actionLabel: string
  href: string
  origin: string
  statusLabel: string
  statusVariant: DeveloperDiscoveryBadgeVariant
  checkedLabel: string
  code: string
}>

export type DeveloperDiscoveryViewModel = Readonly<{
  copy: Readonly<{
    eyebrow: string
    title: string
    description: string
    readOnlyNotice: string
  }>
  summaryFacts: readonly Readonly<{ label: string; value: string }>[]
  artifacts: readonly DeveloperDiscoveryArtifactRow[]
  publicFacts: readonly DeveloperDiscoveryRow[]
  routeHealth: readonly DeveloperDiscoveryRow[]
}>

export const DEVELOPER_DISCOVERY_UI_COPY = Object.freeze({
  actions: {
    public_catalog_schema: 'Open schema',
    public_catalog_examples: 'Open examples',
  },
  freshStatus: getStatusPresentation('current').label,
  checkedPrefix: 'Checked',
  summary: {
    freshness: 'Freshness',
    publishedCatalogs: 'Published catalogs',
    schemaVersion: 'Schema version',
  },
  sourceHeading: 'Source-owned readback',
  factsHeading: 'Current public catalog facts',
  factsDescription: 'Rendered from the public catalog DTO, not private owner evidence.',
  emptyFactsHeading: 'No published catalog facts',
  emptyFactsDescription: 'No source-owned public catalog facts are published.',
  artifactsHeading: 'Artifact status',
  artifactsDescription: 'Each artifact reports its source origin and latest check.',
  readPathsHeading: 'Read path status',
  readPathsDescription: 'Public read paths only.',
  emptyRowsHeading: 'No rows',
  emptyRowsDescription: 'Nothing is recorded for this readback.',
})
