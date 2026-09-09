type LocalDevChild = {
  pid?: number
  kill: (signal: NodeJS.Signals) => void
}

type ProcessKill = (pid: number, signal: NodeJS.Signals) => void

type ChildExitStatusInput = {
  code: number | null
  signal: NodeJS.Signals | null
  requestedSignal?: NodeJS.Signals | null
  reason?: string | null
}

export function isConvexReadyOutput(output: string): boolean
export function isViteReadyOutput(output: string): boolean
export function buildConvexSelectArgs(): string[]
export function buildConvexDevArgs(): string[]
export const DEFAULT_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS: number
export function convexChildEnv(
  env: Record<string, string | undefined>,
  options?: { anonymous?: boolean, log?: (message: string) => void },
): Record<string, string | undefined>
export function convexExitFix(
  output: string,
  env?: Record<string, string | undefined>,
): string
export function readViteArgs(env?: Record<string, string | undefined>): string[]
export function childExitStatus(input: ChildExitStatusInput): number
export function signalProcessTree(
  child: LocalDevChild,
  signal: NodeJS.Signals,
  kill?: ProcessKill,
): boolean
export function terminateProcessTrees(
  children: readonly LocalDevChild[],
  signal: NodeJS.Signals,
  kill?: ProcessKill,
): boolean[]

type ManagedChild = {
  done: Promise<unknown>
  terminate: (
    signal?: NodeJS.Signals,
    reason?: string,
    requestedSignal?: NodeJS.Signals | null,
  ) => void
}

type LocalDevSupervisor = {
  add: <T extends ManagedChild>(managed: T) => T
  signal: (signal: NodeJS.Signals) => void
  terminateAll: (
    signal?: NodeJS.Signals,
    reason?: string,
    requestedSignal?: NodeJS.Signals | null,
  ) => void
  waitForChildren: () => Promise<unknown[]>
}

export function createSupervisor(): LocalDevSupervisor

type LauncherFlags = {
  skipScan: boolean
  skipSeed: boolean
  runDoctor: boolean
  viteArgs: string[]
}

export function parseLauncherFlags(argv?: readonly string[]): LauncherFlags

type DotenvFile = {
  name: string
  contents: string
}

type EffectiveEnv = {
  env: Record<string, string | undefined>
  sources: Record<string, string | undefined>
  dropped: string[]
}

export function effectiveEnv(
  baseEnv?: Record<string, string | undefined>,
  files?: readonly DotenvFile[],
): EffectiveEnv

export function resolveConvexUrl(
  env?: Record<string, string | undefined>,
  sources?: Record<string, string | undefined>,
): { url: string, name: string, file: string } | undefined

export function viteLocalUrl(output: string): string | undefined
export function convexPrintedUrl(output: string): string | undefined

type ConvexProbeResult =
  | { ok: true }
  | {
    ok: false
    reason: 'refused' | 'timeout' | 'invalid_url' | 'unexpected_status'
    status?: number
  }

export function probeConvexUrl(
  url: string,
  fetchImpl?: (url: URL, init?: RequestInit) => Promise<{ status: number }>,
  timeoutMs?: number,
): Promise<ConvexProbeResult>

export function shouldSpawnConvex(probeResult?: ConvexProbeResult): boolean

export function releaseRevision(
  execImpl?: (command: string, args: readonly string[]) => string,
): string | undefined

export function isCatalogueComplete(stdout: string): boolean
export function doctorNextCommand(stdout: string): string | undefined

type StageOutcome = {
  ok: boolean
  stdout?: string
  stderr?: string
  skipped?: boolean
  reason?: string
  fix?: string
}

type StageContext = {
  log?: (message: string) => void
}

type LaunchStage = {
  id: string
  skip?: boolean
  skipReason?: string
  fix?: string
  run: (ctx: StageContext) => Promise<StageOutcome | undefined>
}

export function runStages(
  stages: readonly LaunchStage[],
  ctx?: StageContext,
): Promise<{ ok: boolean, id?: string, ran: string[], skipped: string[] }>

export function buildStages(options: {
  skipScan?: boolean
  skipSeed?: boolean
  run: (reference: string, args?: string) => Promise<StageOutcome>
}): LaunchStage[]
