type AuthorityMode = 'read_only' | 'approval_required' | 'spending_policy' | 'unrestricted_test_only'
type ToolAccess = 'all_admitted' | 'selected_tools'

type LocatedUserCode = {
  userCode: string
  verificationUri?: string
}

type ConsentAttributes = {
  grantRef: string
  grantRevision: number
  toolAccess: ToolAccess
  requestedAuthorityMode?: AuthorityMode
}

type ApprovalBodyInput = {
  grantRef: string
  grantRevision: number
  toolAccess?: ToolAccess
  authorityMode?: AuthorityMode
  toolRefs?: readonly string[]
  state?: string
  requestedAuthorityMode?: AuthorityMode
}

type ApprovalResult =
  | { kind: 'approved', grantRef: string, requestedAuthorityMode?: AuthorityMode }
  | {
    kind: 'failed'
    stage: 'consent_page' | 'approval'
    status: number
    body: string
    requestedAuthorityMode?: AuthorityMode
  }

type FetchLike = (
  url: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
    redirect?: string
  },
) => Promise<{ status: number, text: () => Promise<string> }>

type ConnectChildStream = {
  on: (event: 'data', listener: (chunk: unknown) => void) => unknown
}

type ConnectChild = {
  stdout?: ConnectChildStream | null
  stderr?: ConnectChildStream | null
  on: (event: 'close' | 'error', listener: (...args: never[]) => void) => unknown
  kill?: (signal?: NodeJS.Signals) => unknown
}

type LocalConnectFlags = {
  baseUrl: string
  authorityMode: AuthorityMode
  json: boolean
}

type LocalConnectOptions = {
  argv?: readonly string[]
  spawnImpl?: (baseUrl: string) => ConnectChild
  fetchImpl?: FetchLike
  stdout?: (text: string) => void
  stderr?: (text: string) => void
}

type LocalConnectOutcome = {
  exitCode: number
  result?: unknown
  approval?: ApprovalResult
}

export function isLoopback(url: unknown): boolean
export function parseUserCode(text: unknown): LocatedUserCode | undefined
export function parseConsentAttributes(html: unknown): ConsentAttributes | undefined
export function buildApprovalBody(input: ApprovalBodyInput): string
export function assertConnected(json: unknown): Record<string, unknown>
export function parseFinalJson(text: unknown): unknown
export function approveLocalConsent(input: {
  baseUrl: string
  userCode: string
  authorityMode?: AuthorityMode
  fetchImpl?: FetchLike
}): Promise<ApprovalResult>
export function parseFlags(argv?: readonly string[]): LocalConnectFlags
export function buildConnectArgs(baseUrl: string): string[]
export function runLocalConnect(options?: LocalConnectOptions): Promise<LocalConnectOutcome>
