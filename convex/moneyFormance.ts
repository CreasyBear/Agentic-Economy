"use node"

import { v } from 'convex/values'

import {
  createFormanceContext,
  installPackage4FormanceSchema,
  readFormanceAccount,
  readFormanceConfiguration,
  readFormanceHealth,
  readFormanceTransactionByReference,
} from '../src/modules/money/formance'
import { internalAction } from './_generated/server'

const setupRequired = v.object({ kind: v.literal('setup_required'), code: v.string() })
const unavailable = v.object({ kind: v.literal('unavailable'), code: v.string() })

const healthResult = v.union(
  v.object({
    kind: v.literal('ready'),
    gatewayVersion: v.string(),
    ledgerVersion: v.string(),
    schemaVersion: v.string(),
    schemaDigest: v.string(),
  }),
  setupRequired,
  unavailable,
)

const installationResult = v.union(
  v.object({
    kind: v.literal('completed'),
    ledger: v.string(),
    schemaVersion: v.string(),
    schemaDigest: v.string(),
    replayed: v.boolean(),
  }),
  setupRequired,
  unavailable,
)

const accountResult = v.union(
  v.object({
    kind: v.literal('completed'),
    address: v.string(),
    volumes: v.record(v.string(), v.object({
      inputUnits: v.string(),
      outputUnits: v.string(),
      balanceUnits: v.string(),
    })),
  }),
  v.object({ kind: v.literal('not_found') }),
  setupRequired,
  unavailable,
)

const referenceResult = v.union(
  v.object({
    kind: v.literal('found'),
    reference: v.string(),
    transactionId: v.string(),
    template: v.optional(v.string()),
    metadata: v.record(v.string(), v.string()),
    postings: v.array(v.object({
      source: v.string(),
      destination: v.string(),
      asset: v.string(),
      amountUnits: v.string(),
    })),
  }),
  v.object({ kind: v.literal('absent'), reference: v.string() }),
  setupRequired,
  unavailable,
)

export const health = internalAction({
  args: {},
  returns: healthResult,
  handler: async () => {
    const context = configuredContext()
    return context.kind === 'setup_required'
      ? context
      : await readFormanceHealth(context.context)
  },
})

export const installSchema = internalAction({
  args: {},
  returns: installationResult,
  handler: async () => {
    const context = configuredContext()
    return context.kind === 'setup_required'
      ? context
      : await installPackage4FormanceSchema(context.context)
  },
})

export const readAccount = internalAction({
  args: { address: v.string() },
  returns: accountResult,
  handler: async (_ctx, args) => {
    const context = configuredContext()
    return context.kind === 'setup_required'
      ? context
      : await readFormanceAccount(context.context, args.address)
  },
})

export const readTransactionByReference = internalAction({
  args: { reference: v.string() },
  returns: referenceResult,
  handler: async (_ctx, args) => {
    const context = configuredContext()
    const result = context.kind === 'setup_required'
      ? context
      : await readFormanceTransactionByReference(context.context, args.reference)
    return result.kind !== 'found'
      ? result
      : {
          ...result,
          metadata: { ...result.metadata },
          postings: result.postings.map((posting) => ({ ...posting })),
        }
  },
})

function configuredContext() {
  const result = readFormanceConfiguration()
  return result.kind === 'setup_required'
    ? result
    : Object.freeze({ kind: 'configured' as const, context: createFormanceContext(result.configuration) })
}
