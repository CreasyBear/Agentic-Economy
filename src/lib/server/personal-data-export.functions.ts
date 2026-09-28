import { degrade } from '@/lib/observability/degrade'
import {
  ConvexSourceError,
  createAuthenticatedSourceTransport,
  sourceQuery,
  type ConvexSourceTransport,
} from '@/lib/server/convex-source'
import { problem } from '@/lib/server/problem'

import {
  assemblePersonalDataExport,
  excludedPersonalDataSection,
  type PersonalAccountExportRead,
  type PersonalDataAgentConnection,
  type PersonalDataCallSummary,
  type PersonalDataExport,
  type PersonalDataInvoiceSummary,
  type PersonalDataSection,
  type PersonalDataTaxProfile,
} from '@/modules/principal-account/public'

type SourcePage<Row> = Readonly<{
  page: readonly Row[]
  continueCursor: string
  isDone: boolean
}>

type SourceAgentRecord = PersonalDataAgentConnection & Readonly<{
  currentProviderCredentialId: string
  credentialHistoryTruncated: boolean
  credentials: readonly unknown[]
}>

type SourceCallRecord = PersonalDataCallSummary & Readonly<{
  credentialRef: string
  providerObligationState?: string
  providerAmountUnits?: string
  receiptRef?: string
  recoveryRef?: string
  latencyMs: number
}>

type SourceTaxProfile =
  | Readonly<{ kind: 'missing'; accountRef: string; revision: 0 }>
  | (Readonly<{ kind: 'available' }> & PersonalDataTaxProfile)

const personalAccountExportQuery = sourceQuery<Record<string, never>, PersonalAccountExportRead>(
  'personalAccount:exportUserData',
)
const taxProfileQuery = sourceQuery<Record<string, never>, SourceTaxProfile>(
  'moneyCustomerTaxFacts:readCustomerTaxFacts',
)
const agentDirectoryQuery = sourceQuery<Readonly<{
  now: number
  paginationOpts: Readonly<{ numItems: number; cursor: string | null }>
}>, SourcePage<SourceAgentRecord>>('agentDirectory:listOwnedPage')
const callsQuery = sourceQuery<Readonly<{
  paginationOpts: Readonly<{ numItems: number; cursor: string | null }>
}>, SourcePage<SourceCallRecord>>('capabilityCallProjections:listOwnerCalls')
const invoicesQuery = sourceQuery<Readonly<{
  paginationOpts: Readonly<{ numItems: number; cursor: string | null }>
}>, SourcePage<PersonalDataInvoiceSummary>>('moneyAccountFunding:listOwnerInvoiceHistory')

const EXCLUDED_REASON = 'The existing per-account read was unavailable during this export.'

export async function readPersonalDataExportThroughSource(): Promise<PersonalDataExport> {
  const source = await createAuthenticatedSourceTransport()
  const personal = await source.query(personalAccountExportQuery, {})
  const [taxProfile, agentConnections, calls, invoices] = await Promise.all([
    readSection('personal-data-export-tax-profile', async () => {
      const profile = await source.query(taxProfileQuery, {})
      if (profile.kind === 'missing') return []
      const { kind: _kind, ...row } = profile
      return [row]
    }),
    readSection('personal-data-export-agent-connections', async () => (await collectAgentRows(source)).map(projectAgentConnection)),
    readSection('personal-data-export-calls', async () => (await collectCallRows(source)).map(projectCallSummary)),
    readSection('personal-data-export-invoices', async () => await collectInvoiceRows(source)),
  ])

  return assemblePersonalDataExport({
    personal,
    taxProfile,
    agentConnections,
    calls,
    invoices,
  })
}

export async function handlePersonalDataExportRequest(head = false): Promise<Response> {
  try {
    const data = await readPersonalDataExportThroughSource()
    const date = data.exportedAt.slice(0, 10)
    const headers = {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="agentic-economy-data-${date}.json"`,
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    }
    return new Response(head ? null : `${JSON.stringify(data, null, 2)}\n`, { status: 200, headers })
  } catch (cause) {
    if (cause instanceof ConvexSourceError && cause.code === 'missing_auth') {
      return problem({
        status: 401,
        kind: 'UNAUTHENTICATED',
        code: 'account_data_export_authentication_required',
        detail: 'Sign in to download your Account data.',
      })
    }
    return problem({
      status: 503,
      kind: 'UNAVAILABLE',
      code: 'account_data_export_unavailable',
      detail: 'Account data could not be exported. Try again.',
      retryable: true,
    })
  }
}

async function readSection<Rows>(
  site: string,
  read: () => Promise<Rows>,
): Promise<PersonalDataSection<Rows>> {
  try {
    return { kind: 'available', rows: await read() }
  } catch (cause) {
    return degrade(cause, excludedPersonalDataSection(EXCLUDED_REASON), {
      site,
      reason: 'source_unavailable',
    })
  }
}

async function collectAgentRows(source: ConvexSourceTransport): Promise<readonly SourceAgentRecord[]> {
  const rows: SourceAgentRecord[] = []
  let cursor: string | null = null
  while (true) {
    const page = await source.query(agentDirectoryQuery, {
      now: Date.now(),
      paginationOpts: { numItems: 50, cursor },
    })
    rows.push(...page.page)
    if (page.isDone) return rows
    cursor = nextCursor(cursor, page.continueCursor)
  }
}

async function collectCallRows(source: ConvexSourceTransport): Promise<readonly SourceCallRecord[]> {
  const rows: SourceCallRecord[] = []
  let cursor: string | null = null
  while (true) {
    const page = await source.query(callsQuery, {
      paginationOpts: { numItems: 50, cursor },
    })
    rows.push(...page.page)
    if (page.isDone) return rows
    cursor = nextCursor(cursor, page.continueCursor)
  }
}

async function collectInvoiceRows(source: ConvexSourceTransport): Promise<readonly PersonalDataInvoiceSummary[]> {
  const rows: PersonalDataInvoiceSummary[] = []
  let cursor: string | null = null
  while (true) {
    const page = await source.query(invoicesQuery, {
      paginationOpts: { numItems: 50, cursor },
    })
    rows.push(...page.page)
    if (page.isDone) return rows
    cursor = nextCursor(cursor, page.continueCursor)
  }
}

function nextCursor(current: string | null, next: string): string {
  if (next.length === 0 || next === current) throw new Error('personal_data_export_cursor_invalid')
  return next
}

function projectAgentConnection(row: SourceAgentRecord): PersonalDataAgentConnection {
  return {
    principalRef: row.principalRef,
    displayName: row.displayName,
    applicationRef: row.applicationRef,
    environment: row.environment,
    status: row.status,
    admissionLifecycle: row.admissionLifecycle,
    authorityMode: row.authorityMode,
    scopes: row.scopes,
    lastSeenAt: row.lastSeenAt,
  }
}

function projectCallSummary(row: SourceCallRecord): PersonalDataCallSummary {
  return {
    callRef: row.callRef,
    accountRef: row.accountRef,
    principalRef: row.principalRef,
    applicationRef: row.applicationRef,
    toolRef: row.toolRef,
    providerRef: row.providerRef,
    toolLabel: row.toolLabel,
    state: row.state,
    deliveryState: row.deliveryState,
    paymentState: row.paymentState,
    ...(row.audAmountUnits === undefined ? {} : { audAmountUnits: row.audAmountUnits }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
