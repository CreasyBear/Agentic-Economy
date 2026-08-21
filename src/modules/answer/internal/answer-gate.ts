import { createPrefixedRandomId } from '@/modules/common/random-id'

import type { AnswerSnapshot } from '../answer-synthesizer'
import {
  hasEpistemicVocabulary,
  hasInjectionUpgrade,
  joinHumanCopy,
} from './copy-guard-patterns'

export type AnswerGateFailureCode =
  | 'grounding_failed'
  | 'epistemic_vocabulary'
  | 'injection_upgrade'
  | 'unsupported_provider_claim'
  | 'empty_prose'
export type AnswerGateResult =
  | { ok: true }
  | { ok: false; code: AnswerGateFailureCode; copyId: string; detail?: string }

export type RunAnswerGateInput = {
  snapshot: AnswerSnapshot
  allowedSlugs: ReadonlySet<string>
  forbiddenProviderNames?: readonly string[]
}

export function runAnswerGate(input: RunAnswerGateInput): AnswerGateResult {
  const {
    snapshot,
    allowedSlugs,
    forbiddenProviderNames = [],
  } = input
  const copyId = makeGateCopyId()

  if (snapshot.oneLine.trim().length === 0 || snapshot.summary.trim().length === 0 || snapshot.nextStep.trim().length === 0) {
    return { ok: false, code: 'empty_prose', copyId }
  }

  if (snapshot.providers.length > 0) {
    const grounded = snapshot.providers.every((provider) => allowedSlugs.has(provider.slug))
    if (!grounded) {
      return { ok: false, code: 'grounding_failed', copyId }
    }
  }

  const humanText = joinHumanCopy([snapshot.oneLine, snapshot.summary, snapshot.nextStep])

  if (hasForbiddenProviderName(humanText, forbiddenProviderNames)) {
    return { ok: false, code: 'grounding_failed', copyId }
  }

  if (hasEpistemicVocabulary(humanText)) {
    return { ok: false, code: 'epistemic_vocabulary', copyId }
  }

  if (hasInjectionUpgrade(humanText)) {
    return { ok: false, code: 'injection_upgrade', copyId }
  }

  const decisionText = joinHumanCopy([snapshot.oneLine, snapshot.summary])
  if (
    hasUnsupportedProviderClaim(decisionText, snapshot.providers.map((provider) => provider.name))
    || hasUnsupportedPublishedDetail(decisionText, snapshot.providers)
  ) {
    return { ok: false, code: 'unsupported_provider_claim', copyId }
  }

  return { ok: true }
}

function hasForbiddenProviderName(
  text: string,
  providerNames: readonly string[],
): boolean {
  const normalizedText = ` ${normalizeProviderOccurrenceText(text)} `
  return providerNames.some((name) => {
    const normalizedName = normalizeProviderOccurrenceText(name)
    return normalizedName.length > 0 && normalizedText.includes(` ${normalizedName} `)
  })
}

function normalizeProviderOccurrenceText(value: string): string {
  return value
    .toLocaleLowerCase('en-US')
    .normalize('NFKC')
    .replace(/&/g, ' and ')
    .replace(/['’‘]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasUnsupportedProviderClaim(text: string, providerNames: readonly string[]): boolean {
  const unsupportedPredicate =
    String.raw`(?:confirms?|guarantees?|handles?|can|will)\b|(?:is|are)\s+(?:available|qualified|registered|verified)\b`
  const genericSubject = new RegExp(
    String.raw`\b(?:business(?:es)?|provider(?:s)?|listing(?:s)?|it|they)\s+(?:${unsupportedPredicate})`,
    'gi',
  )
  for (const match of text.matchAll(genericSubject)) {
    if (!claimIsNegated(text, match.index ?? 0)) {
      return true
    }
  }

  return providerNames.some((name) => {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const named = new RegExp(String.raw`\b${escapedName}\s+(?:${unsupportedPredicate})`, 'gi')
    for (const match of text.matchAll(named)) {
      if (!claimIsNegated(text, match.index ?? 0)) {
        return true
      }
    }
    return false
  })
}

function claimIsNegated(text: string, matchIndex: number): boolean {
  const prefix = text.slice(Math.max(0, matchIndex - 64), matchIndex)
  return /(?:\bno\b|\bnot\b|\bnone\b|\bneither\b|\bwithout\b|\bzero\b|n't)(?:\s+\S+){0,6}\s*$/iu.test(prefix)
}

function hasUnsupportedPublishedDetail(
  text: string,
  providers: AnswerSnapshot['providers'],
): boolean {
  if (providers.length === 0) return false
  const normalizedText = normalizePublishedDetail(text)
  const publishedPrices = providers
    .map((provider) => provider.pricingSummary)
    .filter((value): value is string => value !== undefined && value.trim().length > 0)
    .map(normalizePublishedDetail)
  const publishedAvailability = providers
    .flatMap((provider) => [provider.availabilitySummary, provider.hoursLabel])
    .filter((value): value is string => value !== undefined && value.trim().length > 0)
    .map(normalizePublishedDetail)

  const hasPriceClaim = /(?:[$€£]\s*\d|\b\d+(?:\.\d{1,2})?\s*(?:aud|usd|eur|gbp)\b)/i.test(text)
  if (hasPriceClaim && !publishedPrices.some((value) => normalizedText.includes(value))) {
    return true
  }

  const hasAvailabilityClaim =
    /\b24\s*\/\s*7\b|\b24[-\s]?hours?\b|\b(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?\s*(?:[-–—]|to)\s*(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?\b/i.test(text)
  return (
    hasAvailabilityClaim &&
    !publishedAvailability.some((value) => normalizedText.includes(value))
  )
}

function normalizePublishedDetail(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function makeGateCopyId(): string {
  return createPrefixedRandomId(`gate-${Date.now().toString(36)}-`)
}
