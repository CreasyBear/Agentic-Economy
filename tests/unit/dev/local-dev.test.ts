import { describe, expect, it } from 'vitest'

import {
  buildConvexDevArgs,
  buildConvexSelectArgs,
  childExitStatus,
  isConvexReadyOutput,
  isViteReadyOutput,
  signalProcessTree,
  terminateProcessTrees,
} from '../../../tools/dev/local-dev.mjs'

describe('local development launcher', () => {
  it('uses the official non-interactive local upgrade path without a reset option', () => {
    expect(buildConvexSelectArgs()).toEqual(['convex', 'deployment', 'select', 'local'])
    expect(buildConvexDevArgs()).toEqual([
      'convex',
      'dev',
      '--typecheck',
      'disable',
      '--local-force-upgrade',
    ])
    expect(buildConvexDevArgs()).not.toContain('reset')
  })

  it('does not treat Vite output as ready before Convex is ready', () => {
    expect(isConvexReadyOutput('Preparing Convex functions...')).toBe(false)
    expect(isConvexReadyOutput('✔ Convex functions ready!')).toBe(true)
    expect(isViteReadyOutput('Convex functions ready!')).toBe(false)
    expect(isViteReadyOutput('➜ Local: http://127.0.0.1:3024/')).toBe(true)
  })

  it('reports timeout and parent-signal statuses without masking child failures', () => {
    expect(childExitStatus({ code: null, signal: 'SIGINT', reason: 'timeout' })).toBe(124)
    expect(childExitStatus({ code: null, signal: 'SIGINT', requestedSignal: 'SIGINT' })).toBe(130)
    expect(childExitStatus({ code: 17, signal: null })).toBe(17)
  })

  it('signals both detached process groups and falls back to a direct child', () => {
    const groupSignals: Array<[number, string]> = []
    const convex = { pid: 101, kill: () => undefined }
    const vite = { pid: 202, kill: () => undefined }
    const kill = (pid: number, signal: string) => groupSignals.push([pid, signal])

    expect(terminateProcessTrees([convex, vite], 'SIGINT', kill)).toEqual([true, true])
    expect(groupSignals).toEqual([[-101, 'SIGINT'], [-202, 'SIGINT']])

    let directSignal: string | undefined
    const fallbackChild = {
      pid: 303,
      kill: (signal: string) => { directSignal = signal },
    }
    const refusingKill = () => { throw new Error('process group unavailable') }
    expect(signalProcessTree(fallbackChild, 'SIGTERM', refusingKill)).toBe(true)
    expect(directSignal).toBe('SIGTERM')
  })
})
