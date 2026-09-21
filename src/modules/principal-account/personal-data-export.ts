export type PersonalAccountExportRead = Readonly<{
  contract: 'ae.personal-account.export:v1'
  exportedAt: number
  principal: Readonly<{
    principalRef: string
    kind: string
    lifecycle: string
    displayName: string
  }>
  memberships: readonly Readonly<{
    membershipRef: string
    accountRef: string
    lifecycle: string
    revision: number
    createdAt: number
  }>[]
  ownerships: readonly Readonly<{
    ownershipRef: string
    accountRef: string
    lifecycle: string
    revision: number
    createdAt: number
  }>[]
  linkedAccounts: readonly Readonly<{
    accountRef: string
    displayName: string
    lifecycle: string
  }>[]
  sessionSelection: Readonly<{
    activeAccountRef: string
    selectedAt: number
    revision: number
  }> | null
  notificationPreferences: readonly Readonly<{
    accountRef: string
    lowCreditBalance: boolean
    lowCreditThresholdCents: number
    spendCapWarning: boolean
    callFailureSpike: boolean
    invoiceReady: boolean
    teamMembershipChanged: boolean
    revision: number
    updatedAt: number | null
  }>[]
  securityHistory: readonly Readonly<{
    eventRef: string
    eventType: string
    actorKind: string
    actorRef: string
    targetType: string
    targetRef: string
    outcome: string
    sourceSystem: string
    recordedAt: number
    correlationRef: string
  }>[]
}>

export type PersonalDataTaxProfile = Readonly<{
  accountRef: string
  abn: string
  gstRegistered: boolean
  legalName: string
  addressLine1: string
  addressLine2?: string
  locality: string
  region?: string
  postalCode: string
  country: 'AU'
  legalCustomerRef: string
  effectiveAt: number
  updatedAt: number
  revision: number
}>

export type PersonalDataAgentConnection = Readonly<{
  principalRef: string
  displayName: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  status: 'connected' | 'attention' | 'expired' | 'disconnected'
  admissionLifecycle: 'active' | 'revoked' | 'expired'
  authorityMode: string
  scopes: readonly string[]
  lastSeenAt: number
}>

export type PersonalDataCallSummary = Readonly<{
  callRef: string
  accountRef: string
  principalRef: string
  applicationRef: string
  toolRef: string
  providerRef: string
  toolLabel: string
  state: 'completed' | 'refused' | 'outcome_unknown'
  deliveryState: 'delivered' | 'not_delivered' | 'unknown'
  paymentState: 'settled' | 'released' | 'unknown' | 'not_applicable'
  audAmountUnits?: string
  createdAt: number
  updatedAt: number
}>

export type PersonalDataInvoiceSummary = Readonly<{
  commandRef: string
  createdAt: number
  description: string
  totalUnits: string
  status: 'succeeded' | 'reversed'
  appliedTransactionRef: string | null
  hasPaymentReceipt: boolean
  taxInvoice: Readonly<{ kind: 'issued'; documentRef: string }>
    | Readonly<{ kind: 'withheld'; reason: string }>
}>

export type PersonalDataSection<Rows> =
  | Readonly<{ kind: 'available'; rows: Rows }>
  | Readonly<{ kind: 'excluded'; reason: string }>

export type PersonalDataExportSources = Readonly<{
  personal: PersonalAccountExportRead
  taxProfile: PersonalDataSection<readonly PersonalDataTaxProfile[]>
  agentConnections: PersonalDataSection<readonly PersonalDataAgentConnection[]>
  calls: PersonalDataSection<readonly PersonalDataCallSummary[]>
  invoices: PersonalDataSection<readonly PersonalDataInvoiceSummary[]>
}>

type ExportedSection<Rows> = Rows | Readonly<{ excluded: string }>

export type PersonalDataExport = Readonly<{
  exportedAt: string
  account: Readonly<{
    principalRef: string
    kind: string
    lifecycle: string
    displayName: string
    activeAccountRef: string | null
  }>
  sections: Readonly<{
    workspaceProfile: PersonalAccountExportRead['linkedAccounts']
    memberships: readonly Readonly<{
      access: 'member' | 'owner'
      reference: string
      accountRef: string
      lifecycle: string
      revision: number
      createdAt: number
    }>[]
    notificationPreferences: PersonalAccountExportRead['notificationPreferences']
    taxProfile: ExportedSection<readonly PersonalDataTaxProfile[]>
    agentConnections: ExportedSection<readonly PersonalDataAgentConnection[]>
    securityHistory: PersonalAccountExportRead['securityHistory']
    calls: ExportedSection<readonly PersonalDataCallSummary[]>
    invoices: ExportedSection<readonly PersonalDataInvoiceSummary[]>
  }>
}>

export function excludedPersonalDataSection<Rows = never[]>(reason: string): PersonalDataSection<Rows> {
  return { kind: 'excluded', reason }
}

export function assemblePersonalDataExport(sources: PersonalDataExportSources): PersonalDataExport {
  const { personal } = sources
  return {
    exportedAt: new Date(personal.exportedAt).toISOString(),
    account: {
      ...personal.principal,
      activeAccountRef: personal.sessionSelection?.activeAccountRef ?? null,
    },
    sections: {
      workspaceProfile: personal.linkedAccounts,
      memberships: [
        ...personal.memberships.map((row) => ({
          access: 'member' as const,
          reference: row.membershipRef,
          accountRef: row.accountRef,
          lifecycle: row.lifecycle,
          revision: row.revision,
          createdAt: row.createdAt,
        })),
        ...personal.ownerships.map((row) => ({
          access: 'owner' as const,
          reference: row.ownershipRef,
          accountRef: row.accountRef,
          lifecycle: row.lifecycle,
          revision: row.revision,
          createdAt: row.createdAt,
        })),
      ],
      notificationPreferences: personal.notificationPreferences,
      taxProfile: exportedSection(sources.taxProfile),
      agentConnections: exportedSection(sources.agentConnections),
      securityHistory: personal.securityHistory,
      calls: exportedSection(sources.calls),
      invoices: exportedSection(sources.invoices),
    },
  }
}

function exportedSection<Rows>(section: PersonalDataSection<Rows>): ExportedSection<Rows> {
  return section.kind === 'available' ? section.rows : { excluded: section.reason }
}
