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
