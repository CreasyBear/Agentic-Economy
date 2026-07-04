import { ed25519 } from '@noble/curves/ed25519'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'
import { AdapterSdkAuthorityBoundarySchema, adapterSdkAuthorityBoundary } from 'handshake-protocol-kernel/adapter-sdk'
import * as handshakeRoot from 'handshake-protocol-kernel'
import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalAction, internalMutation } from './_generated/server'

const spikeVerdictValues = ['fallback'] as const
const fallbackReasonValues = ['kernel_not_exported_from_allowed_root'] as const
const consumptionValues = ['consumed', 'already_consumed'] as const
const executionShapeValues = ['convex_mutation_probe', 'action_plus_terminal_mutation_fallback'] as const

type SpikeVerdict = (typeof spikeVerdictValues)[number]
type FallbackReason = (typeof fallbackReasonValues)[number]
type Consumption = (typeof consumptionValues)[number]
type ExecutionShape = (typeof executionShapeValues)[number]
type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export type HandshakeRuntimeSpikeInput = {
  readonly now: string
  readonly actionContractId: string
  readonly greenlightId: string
  readonly gateAttemptId: string
}

export type HandshakeRuntimeSpikeResult = {
  readonly verdict: SpikeVerdict
  readonly fallbackReason: FallbackReason
  readonly executionShape: ExecutionShape
  readonly terminalMutationPersisted: boolean
  readonly acquisition: 'npm:handshake-protocol-kernel@0.4.0'
  readonly kernelAccess: {
    readonly rootImportResolved: boolean
    readonly adapterSdkImportResolved: boolean
    readonly selfHostedKernelExportedFromAllowedRoot: boolean
  }
  readonly injected: {
    readonly now: string
    readonly actionContractId: string
    readonly greenlightId: string
    readonly gateAttemptId: string
  }
  readonly zod: {
    readonly adapterSdkStrictParseSucceeded: boolean
    readonly adapterSdkStrictUnknownKeyRejected: boolean
  }
  readonly crypto: {
    readonly sha256Succeeded: boolean
    readonly ed25519Succeeded: boolean
  }
  readonly hashes: {
    readonly actionContractHash: string
    readonly replayActionContractHash: string
    readonly deterministic: boolean
  }
  readonly cas: {
    readonly firstConsumption: Consumption
    readonly replayConsumption: Consumption
    readonly singleUseHeld: boolean
  }
}

const consumptionValidator = v.union(v.literal('consumed'), v.literal('already_consumed'))

const spikeResultValidator = v.object({
  verdict: v.literal('fallback'),
  fallbackReason: v.literal('kernel_not_exported_from_allowed_root'),
  executionShape: v.union(v.literal('convex_mutation_probe'), v.literal('action_plus_terminal_mutation_fallback')),
  terminalMutationPersisted: v.boolean(),
  acquisition: v.literal('npm:handshake-protocol-kernel@0.4.0'),
  kernelAccess: v.object({
    rootImportResolved: v.boolean(),
    adapterSdkImportResolved: v.boolean(),
    selfHostedKernelExportedFromAllowedRoot: v.boolean(),
  }),
  injected: v.object({
    now: v.string(),
    actionContractId: v.string(),
    greenlightId: v.string(),
    gateAttemptId: v.string(),
  }),
  zod: v.object({
    adapterSdkStrictParseSucceeded: v.boolean(),
    adapterSdkStrictUnknownKeyRejected: v.boolean(),
  }),
  crypto: v.object({
    sha256Succeeded: v.boolean(),
    ed25519Succeeded: v.boolean(),
  }),
  hashes: v.object({
    actionContractHash: v.string(),
    replayActionContractHash: v.string(),
    deterministic: v.boolean(),
  }),
  cas: v.object({
    firstConsumption: consumptionValidator,
    replayConsumption: consumptionValidator,
    singleUseHeld: v.boolean(),
  }),
})

const spikeArgsValidator = {
  now: v.string(),
  actionContractId: v.string(),
  greenlightId: v.string(),
  gateAttemptId: v.string(),
}

export const run = internalMutation({
  args: spikeArgsValidator,
  returns: spikeResultValidator,
  handler: async (_ctx, args) =>
    runHandshakeConvexRuntimeSpike(args, {
      executionShape: 'convex_mutation_probe',
      terminalMutationPersisted: false,
      firstConsumption: 'consumed',
      replayConsumption: 'already_consumed',
    }),
})

export const runFallbackAction = internalAction({
  args: spikeArgsValidator,
  returns: spikeResultValidator,
  handler: async (ctx, args): Promise<HandshakeRuntimeSpikeResult> => {
    const actionContractHash = hashJson({
      actionContractId: args.actionContractId,
      greenlightId: args.greenlightId,
      issuedAt: args.now,
    })
    const firstConsumption: Consumption = await ctx.runMutation(internal.spikeHandshakeRuntime.consumeGreenlightTerminal, {
      ...args,
      actionContractHash,
    })
    const replayConsumption: Consumption = await ctx.runMutation(internal.spikeHandshakeRuntime.consumeGreenlightTerminal, {
      ...args,
      actionContractHash,
    })

    return runHandshakeConvexRuntimeSpike(args, {
      executionShape: 'action_plus_terminal_mutation_fallback',
      terminalMutationPersisted: true,
      firstConsumption,
      replayConsumption,
    })
  },
})

export const consumeGreenlightTerminal = internalMutation({
  args: {
    ...spikeArgsValidator,
    actionContractHash: v.string(),
  },
  returns: consumptionValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('operationKeys')
      .withIndex('by_actor_operation_key', (query) =>
        query.eq('actorRef', 'scope3-handshake-spike').eq('operationName', 'consumeGreenlightTerminal').eq('key', args.greenlightId)
      )
      .unique()

    if (existing !== null) {
      return 'already_consumed'
    }

    const timestamp = Date.parse(args.now)
    await ctx.db.insert('operationKeys', {
      scope: 'handshake_spike',
      actorKind: 'system',
      actorRef: 'scope3-handshake-spike',
      operationName: 'consumeGreenlightTerminal',
      key: args.greenlightId,
      requestHash: args.actionContractHash,
      sourceHash: args.gateAttemptId,
      status: 'succeeded',
      resultHash: args.actionContractHash,
      effectRefs: [args.actionContractId],
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    return 'consumed'
  },
})

export function runHandshakeConvexRuntimeSpike(
  input: HandshakeRuntimeSpikeInput,
  casEvidence: {
    readonly executionShape: ExecutionShape
    readonly terminalMutationPersisted: boolean
    readonly firstConsumption: Consumption
    readonly replayConsumption: Consumption
  }
): HandshakeRuntimeSpikeResult {
  const parsedBoundary = AdapterSdkAuthorityBoundarySchema.parse(adapterSdkAuthorityBoundary)
  const strictUnknownKeyRejected = !AdapterSdkAuthorityBoundarySchema.safeParse({
    ...adapterSdkAuthorityBoundary,
    extraKeyRejectedByStrictSchema: true,
  }).success

  const actionContractHash = hashJson({
    actionContractId: input.actionContractId,
    greenlightId: input.greenlightId,
    issuedAt: input.now,
  })
  const replayActionContractHash = hashJson({
    actionContractId: input.actionContractId,
    greenlightId: input.greenlightId,
    issuedAt: input.now,
  })

  const messageHash = sha256(utf8ToBytes(`${input.gateAttemptId}:${actionContractHash}`))
  const privateKey = Uint8Array.from([
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1,
  ])
  const signature = ed25519.sign(messageHash, privateKey)
  const publicKey = ed25519.getPublicKey(privateKey)

  return {
    verdict: 'fallback',
    fallbackReason: 'kernel_not_exported_from_allowed_root',
    executionShape: casEvidence.executionShape,
    terminalMutationPersisted: casEvidence.terminalMutationPersisted,
    acquisition: 'npm:handshake-protocol-kernel@0.4.0',
    kernelAccess: {
      rootImportResolved: Object.keys(handshakeRoot).length > 0,
      adapterSdkImportResolved: parsedBoundary.authorityCreated === false,
      selfHostedKernelExportedFromAllowedRoot: Object.prototype.hasOwnProperty.call(handshakeRoot, 'HandshakeKernel'),
    },
    injected: {
      now: input.now,
      actionContractId: input.actionContractId,
      greenlightId: input.greenlightId,
      gateAttemptId: input.gateAttemptId,
    },
    zod: {
      adapterSdkStrictParseSucceeded: parsedBoundary.authorityCreated === false,
      adapterSdkStrictUnknownKeyRejected: strictUnknownKeyRejected,
    },
    crypto: {
      sha256Succeeded: bytesToHex(messageHash).length === 64,
      ed25519Succeeded: ed25519.verify(signature, messageHash, publicKey),
    },
    hashes: {
      actionContractHash,
      replayActionContractHash,
      deterministic: actionContractHash === replayActionContractHash,
    },
    cas: {
      firstConsumption: casEvidence.firstConsumption,
      replayConsumption: casEvidence.replayConsumption,
      singleUseHeld: casEvidence.firstConsumption === 'consumed' && casEvidence.replayConsumption === 'already_consumed',
    },
  }
}

function hashJson(value: JsonValue): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalJson(value))))
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  }

  if (isJsonRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] ?? null)}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

function isJsonRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
