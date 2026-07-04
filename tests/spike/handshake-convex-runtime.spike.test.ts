import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { HandshakeRuntimeSpikeInput, HandshakeRuntimeSpikeResult } from '../../convex/spikeHandshakeRuntime'
import { runHandshakeConvexRuntimeSpike } from '../../convex/spikeHandshakeRuntime'

const spikeInput = {
  now: '2026-07-04T00:00:00.000Z',
  actionContractId: 'contract:scope3:spike:1',
  greenlightId: 'greenlight:scope3:spike:1',
  gateAttemptId: 'gate:scope3:spike:1',
} as const

type SpikeFunctionName = 'spikeHandshakeRuntime:run' | 'spikeHandshakeRuntime:runFallbackAction'

describe('Handshake Convex runtime spike', () => {
  it('records a FALLBACK verdict when the npm root API cannot expose the self-hosted kernel', () => {
    const result = runHandshakeConvexRuntimeSpike(spikeInput, {
      executionShape: 'convex_mutation_probe',
      terminalMutationPersisted: false,
      firstConsumption: 'consumed',
      replayConsumption: 'already_consumed',
    })

    expect(result).toMatchObject({
      verdict: 'fallback',
      fallbackReason: 'kernel_not_exported_from_allowed_root',
      executionShape: 'convex_mutation_probe',
      terminalMutationPersisted: false,
      acquisition: 'npm:handshake-protocol-kernel@0.4.0',
      kernelAccess: {
        rootImportResolved: true,
        adapterSdkImportResolved: true,
        selfHostedKernelExportedFromAllowedRoot: false,
      },
    })
  })

  it('proves injected time and ids, deterministic hashes, strict zod parsing, @noble crypto, and single-use CAS', () => {
    const result = runHandshakeConvexRuntimeSpike(spikeInput, {
      executionShape: 'convex_mutation_probe',
      terminalMutationPersisted: false,
      firstConsumption: 'consumed',
      replayConsumption: 'already_consumed',
    })

    expect(result.injected).toEqual(spikeInput)
    expect(result.hashes).toEqual({
      actionContractHash: '62c61e291d83c1134274ee331ea591211879e9d6888b6779b6dd65616c55f71e',
      replayActionContractHash: '62c61e291d83c1134274ee331ea591211879e9d6888b6779b6dd65616c55f71e',
      deterministic: true,
    })
    expect(result.zod).toEqual({
      adapterSdkStrictParseSucceeded: true,
      adapterSdkStrictUnknownKeyRejected: true,
    })
    expect(result.crypto).toEqual({
      sha256Succeeded: true,
      ed25519Succeeded: true,
    })
    expect(result.cas).toEqual({
      firstConsumption: 'consumed',
      replayConsumption: 'already_consumed',
      singleUseHeld: true,
    })
  })

  it('drives the Convex internal mutation probe for zod, crypto, hash, and root verdict', () => {
    const unique = `vitest-mutation-${process.pid}`
    const input = {
      now: '2026-07-04T00:00:00.000Z',
      actionContractId: `contract:scope3:spike:${unique}`,
      greenlightId: `greenlight:scope3:spike:${unique}`,
      gateAttemptId: `gate:scope3:spike:${unique}`,
    }
    const result = runConvexSpikeFunction('spikeHandshakeRuntime:run', input)

    expect(result).toMatchObject({
      verdict: 'fallback',
      fallbackReason: 'kernel_not_exported_from_allowed_root',
      executionShape: 'convex_mutation_probe',
      terminalMutationPersisted: false,
      kernelAccess: {
        rootImportResolved: true,
        adapterSdkImportResolved: true,
        selfHostedKernelExportedFromAllowedRoot: false,
      },
      zod: {
        adapterSdkStrictParseSucceeded: true,
        adapterSdkStrictUnknownKeyRejected: true,
      },
      crypto: {
        sha256Succeeded: true,
        ed25519Succeeded: true,
      },
    })
    expect(result.hashes.actionContractHash).toMatch(/^[a-f0-9]{64}$/)
    expect(result.hashes.actionContractHash).toBe(result.hashes.replayActionContractHash)
  }, 120_000)

  it('drives the Convex action + terminal internal mutation fallback', () => {
    const unique = `vitest-${process.pid}`
    const input = {
      now: '2026-07-04T00:00:00.000Z',
      actionContractId: `contract:scope3:spike:${unique}`,
      greenlightId: `greenlight:scope3:spike:${unique}`,
      gateAttemptId: `gate:scope3:spike:${unique}`,
    }

    const result = runConvexSpikeFunction('spikeHandshakeRuntime:runFallbackAction', input)

    expect(result).toMatchObject({
      verdict: 'fallback',
      executionShape: 'action_plus_terminal_mutation_fallback',
      terminalMutationPersisted: true,
      cas: {
        firstConsumption: 'consumed',
        replayConsumption: 'already_consumed',
        singleUseHeld: true,
      },
    })
    expect(result.hashes.actionContractHash).toMatch(/^[a-f0-9]{64}$/)
    expect(result.hashes.actionContractHash).toBe(result.hashes.replayActionContractHash)
  }, 120_000)

  it('keeps the npm root finding explicit for 03-03 before any ConvexProtocolStore work starts', () => {
    const rootBundle = readFileSync('node_modules/handshake-protocol-kernel/dist/index.mjs', 'utf8')
    const packageJson = readFileSync('node_modules/handshake-protocol-kernel/package.json', 'utf8')

    expect(packageJson).toContain('"version": "0.4.0"')
    expect(packageJson).toContain('"./adapter-sdk"')
    expect(rootBundle).toContain('class HandshakeKernel')
    expect(rootBundle).toContain('node_modules/hono')
    expect(rootBundle).not.toContain('export { HandshakeKernel')
  })
})

function runConvexSpikeFunction(functionName: SpikeFunctionName, input: HandshakeRuntimeSpikeInput): HandshakeRuntimeSpikeResult {
  execFileSync('npx', ['convex', 'dev', '--once', '--typecheck=disable', '--codegen=disable'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output = execFileSync('npx', ['convex', 'run', functionName, JSON.stringify(input)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return JSON.parse(output.slice(output.indexOf('{'))) as HandshakeRuntimeSpikeResult
}
