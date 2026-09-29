import { degradeBackend } from '@/lib/observability/degrade-backend'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'

import { copyX402SellerIdentity, validX402SellerIdentity, x402SellerIdentityDigest } from './identity'
import type {
  CreateX402SellerOnboardingCommand,
  X402SellerOnboarding,
  X402SellerOnboardingCommand,
  X402SellerOnboardingResult,
} from './types'

function validRef(value: string): boolean {
  return value.length > 0 && value.length <= 2_048 && value.trim() === value
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function commandDigest(command: CreateX402SellerOnboardingCommand | X402SellerOnboardingCommand): string | undefined {
  try {
    if (command.kind === 'create') {
      return canonicalDigest({
        format: 'ae-x402-seller-onboarding-command:v1',
        ...command,
        identity: copyX402SellerIdentity(command.identity),
      })
    }
    if (command.kind === 'observe_identity') {
      return canonicalDigest({
        format: 'ae-x402-seller-onboarding-command:v1',
        ...command,
        observedIdentity: copyX402SellerIdentity(command.observedIdentity),
      })
    }
    return canonicalDigest({ format: 'ae-x402-seller-onboarding-command:v1', ...command })
  } catch (cause) {
    return degradeBackend(cause, undefined, {
      site: 'commandDigest', reason: 'invalid_response',
    })
  }
}

function validOnboarding(onboarding: X402SellerOnboarding): boolean {
  if (!validRef(onboarding.onboardingRef) || !validX402SellerIdentity(onboarding.identity)) return false
  if (x402SellerIdentityDigest(onboarding.identity) !== onboarding.identityDigest) return false
  if (!validTime(onboarding.createdAt) || !validTime(onboarding.updatedAt) || onboarding.updatedAt < onboarding.createdAt) {
    return false
  }
  const commandIds = new Set<string>()
  return onboarding.commandReceipts.every((receipt) => {
    if (!validRef(receipt.commandId) || !isCanonicalDigest(receipt.commandDigest) || commandIds.has(receipt.commandId)) {
      return false
    }
    commandIds.add(receipt.commandId)
    return true
  })
}

function replay(
  onboarding: X402SellerOnboarding,
  commandId: string,
  digest: string,
): X402SellerOnboardingResult | null {
  const receipt = onboarding.commandReceipts.find((candidate) => candidate.commandId === commandId)
  if (receipt === undefined) return null
  if (receipt.commandDigest !== digest) return { kind: 'refused', reason: 'operation_key_conflict' }
  return { kind: 'replayed', onboarding }
}

function applyCommand(
  onboarding: X402SellerOnboarding,
  commandId: string,
  digest: string,
  now: number,
  patch: Partial<X402SellerOnboarding>,
): X402SellerOnboardingResult {
  return {
    kind: 'applied',
    onboarding: {
      ...onboarding,
      ...patch,
      commandReceipts: [...onboarding.commandReceipts, { commandId, commandDigest: digest }],
      updatedAt: now,
    },
  }
}

function validEvidenceDigest(value: string): boolean {
  return isCanonicalDigest(value)
}

export function createX402SellerOnboarding(
  command: CreateX402SellerOnboardingCommand,
  now: number,
  existing?: X402SellerOnboarding,
): X402SellerOnboardingResult {
  if (!validRef(command.commandId) || !validRef(command.onboardingRef)) {
    return { kind: 'refused', reason: 'invalid_command' }
  }
  if (!validTime(now)) return { kind: 'refused', reason: 'invalid_time' }
  if (!validX402SellerIdentity(command.identity)) return { kind: 'refused', reason: 'invalid_identity' }
  const digest = commandDigest(command)
  if (digest === undefined) return { kind: 'refused', reason: 'invalid_command' }
  if (existing !== undefined) {
    if (!validOnboarding(existing)) return { kind: 'refused', reason: 'integrity_failure' }
    const replayed = replay(existing, command.commandId, digest)
    return replayed ?? { kind: 'refused', reason: 'already_exists' }
  }
  const identity = copyX402SellerIdentity(command.identity)
  return {
    kind: 'applied',
    onboarding: {
      onboardingRef: command.onboardingRef,
      identity,
      identityDigest: x402SellerIdentityDigest(identity),
      state: 'draft',
      commandReceipts: [{ commandId: command.commandId, commandDigest: digest }],
      createdAt: now,
      updatedAt: now,
    },
  }
}

export function transitionX402SellerOnboarding(
  onboarding: X402SellerOnboarding,
  command: X402SellerOnboardingCommand,
  now: number,
): X402SellerOnboardingResult {
  if (!validOnboarding(onboarding)) return { kind: 'refused', reason: 'integrity_failure' }
  if (!validRef(command.commandId)) return { kind: 'refused', reason: 'invalid_command' }
  const digest = commandDigest(command)
  if (digest === undefined) return { kind: 'refused', reason: 'invalid_command' }
  const replayed = replay(onboarding, command.commandId, digest)
  if (replayed !== null) return replayed
  if (!validTime(now) || now < onboarding.updatedAt) return { kind: 'refused', reason: 'invalid_time' }
  if (!isCanonicalDigest(command.expectedIdentityDigest)) return { kind: 'refused', reason: 'invalid_command' }
  if (command.expectedIdentityDigest !== onboarding.identityDigest) {
    return { kind: 'refused', reason: 'identity_mismatch' }
  }

  switch (command.kind) {
    case 'request_claim':
      if (onboarding.state !== 'draft' && onboarding.state !== 'claim_failed') {
        return { kind: 'refused', reason: 'invalid_transition' }
      }
      return applyCommand(onboarding, command.commandId, digest, now, { state: 'claim_pending' })

    case 'record_claim':
      if (onboarding.state !== 'claim_pending') return { kind: 'refused', reason: 'invalid_transition' }
      if (
        (command.outcome !== 'verified' && command.outcome !== 'failed')
        || !validEvidenceDigest(command.evidenceDigest)
      ) return { kind: 'refused', reason: 'invalid_command' }
      return applyCommand(onboarding, command.commandId, digest, now, {
        state: command.outcome === 'verified' ? 'claimed' : 'claim_failed',
        claimEvidenceDigest: command.evidenceDigest,
      })

    case 'admit':
      if (onboarding.state !== 'claimed') return { kind: 'refused', reason: 'invalid_transition' }
      if (!validEvidenceDigest(command.evidenceDigest)) return { kind: 'refused', reason: 'invalid_command' }
      return applyCommand(onboarding, command.commandId, digest, now, {
        state: 'published', admissionEvidenceDigest: command.evidenceDigest,
      })

    case 'observe_identity': {
      if (onboarding.state === 'withdrawn' || onboarding.state === 'stale') {
        return { kind: 'refused', reason: 'invalid_transition' }
      }
      if (!validX402SellerIdentity(command.observedIdentity)) {
        return { kind: 'refused', reason: 'invalid_identity' }
      }
      const observedDriftDigest = x402SellerIdentityDigest(command.observedIdentity)
      return applyCommand(onboarding, command.commandId, digest, now, observedDriftDigest === onboarding.identityDigest
        ? {}
        : { state: 'stale', observedDriftDigest })
    }

    case 'withdraw':
      if (onboarding.state === 'withdrawn') return { kind: 'refused', reason: 'invalid_transition' }
      if (!validEvidenceDigest(command.evidenceDigest)) return { kind: 'refused', reason: 'invalid_command' }
      return applyCommand(onboarding, command.commandId, digest, now, {
        state: 'withdrawn', withdrawalEvidenceDigest: command.evidenceDigest,
      })
  }
}
