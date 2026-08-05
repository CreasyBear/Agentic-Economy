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
}

export function runAnswerGate(input: RunAnswerGateInput): AnswerGateResult {
  const { snapshot, allowedSlugs } = input
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

  if (hasEpistemicVocabulary(humanText)) {
    return { ok: false, code: 'epistemic_vocabulary', copyId }
  }

  if (hasInjectionUpgrade(humanText)) {
    return { ok: false, code: 'injection_upgrade', copyId }
  }

  const decisionText = joinHumanCopy([snapshot.oneLine, snapshot.summary])
  if (
    hasUnsupportedProviderClaim(decisionText, snapshot.providers.map((provider) => provider.name)) ||
    hasUnsupportedPublishedDetail(decisionText, snapshot.providers)
  ) {
    return { ok: false, code: 'unsupported_provider_claim', copyId }
  }

  return { ok: true }
}

function hasUnsupportedProviderClaim(text: string, providerNames: readonly string[]): boolean {
  const unsupportedPredicate =
    String.raw`(?:confirms?|guarantees?|handles?|can|will)\b|(?:is|are)\s+(?:available|qualified|registered|verified)\b`
  const genericSubject = new RegExp(
    String.raw`\b(?:business(?:es)?|provider(?:s)?|listing(?:s)?|it|they)\s+(?:${unsupportedPredicate})`,
    'i',
  )
  if (genericSubject.test(text)) {
    return true
  }

  return providerNames.some((name) => {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(String.raw`\b${escapedName}\s+(?:${unsupportedPredicate})`, 'i').test(text)
  })
}

function hasUnsupportedPublishedDetail(
  text: string,
  providers: AnswerSnapshot['providers'],
): boolean {
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
