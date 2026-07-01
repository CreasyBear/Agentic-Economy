import type { AnswerArtifact } from '../answer-schema'
import { buildAgentJsonUrl, type AnswerSnapshot } from '../answer-synthesizer'
import { isCompactLayoutProfile, resolveLayoutProfile } from './answer-layout-profile'
import { parseLocationIntent } from './location-intent'

export function buildArtifactsFromSnapshot(snapshot: AnswerSnapshot): AnswerArtifact[] {
  const profile = resolveLayoutProfile({
    ...(snapshot.layoutProfile === undefined ? {} : { layoutProfile: snapshot.layoutProfile }),
    ...(snapshot.compactLayout === true ? { compactLayout: true } : {}),
    providerCount: snapshot.providers.length,
  })

  const compact = isCompactLayoutProfile(profile)
  const location = parseLocationIntent(snapshot.query)
  const contactReady = !compact && snapshot.providers.some((provider) => provider.inquiryUrl !== undefined)
  const artifacts: AnswerArtifact[] = [
    { kind: 'one-line', text: snapshot.oneLine },
  ]

  if (profile === 'compare_pair' && snapshot.providers.length >= 2) {
    artifacts.push({
      kind: 'provider-compare-table',
      providers: [...snapshot.providers],
      fields: ['area', 'response', 'availability', 'nextStep'],
    })
    artifacts.push({ kind: 'provider-tradeoff-list', providers: [...snapshot.providers] })
  }

  if (snapshot.providers.length > 0) {
    artifacts.push({ kind: 'provider-cards', providers: [...snapshot.providers] })
  }

  if (!compact && profile !== 'empty_state' && profile !== 'compare_pair') {
    if (location !== undefined && snapshot.providers.length > 0) {
      artifacts.push({ kind: 'location-map', label: location.label, placeQuery: location.placeQuery })
      artifacts.push({
        kind: 'service-area-fit',
        providers: [...snapshot.providers],
        locationLabel: location.label,
      })
    }
  }

  if (profile === 'discovery_full' && snapshot.providers.length > 1) {
    artifacts.push({ kind: 'published-details-rail', providers: [...snapshot.providers] })
  }

  if (profile === 'discovery_full' && snapshot.providers.length > 1 && location === undefined) {
    artifacts.push({ kind: 'provider-tradeoff-list', providers: [...snapshot.providers] })
  }

  const showSummary =
    !compact &&
    snapshot.summary.length > 0 &&
    (profile === 'discovery_full' || profile === 'compare_pair' || profile === 'empty_state')

  if (showSummary) {
    artifacts.push({ kind: 'prose', block: 'summary', text: snapshot.summary })
  }

  if (contactReady && profile !== 'boundary_explain') {
    artifacts.push({ kind: 'next-step-menu', providers: [...snapshot.providers] })
    artifacts.push({
      kind: 'confirmation-checklist',
      title: 'Confirm the practical details',
      items: [
        'What needs doing and where',
        'Preferred timing',
        'Photos, access, or site constraints',
        'Quote and job acceptance',
      ],
    })
  }

  if (shouldShowMessageStarter(snapshot)) {
    const provider = snapshot.providers[0]
    if (provider !== undefined) {
      const timing = extractTimingLabel(snapshot.query)
      artifacts.push({
        kind: 'message-starter',
        provider,
        need: snapshot.query,
        ...(location === undefined ? {} : { location: location.label }),
        ...(timing === undefined ? {} : { timing }),
      })
    }
  }

  if (profile === 'boundary_explain') {
    artifacts.push({
      kind: 'safe-route-rail',
      ...(snapshot.providers.length > 0 ? { providers: [...snapshot.providers] } : {}),
      query: snapshot.query,
    })
  }

  if (profile === 'empty_state') {
    artifacts.push({
      kind: 'recovery-prompts',
      title: 'Try a narrower search',
      prompts: buildRecoveryPrompts(snapshot.query),
    })
  }

  if (snapshot.nextStep.length > 0) {
    artifacts.push({ kind: 'what-to-do-now', text: snapshot.nextStep })
  }

  return artifacts
}

function shouldShowMessageStarter(snapshot: AnswerSnapshot): boolean {
  if (snapshot.providers.length !== 1) {
    return false
  }
  if (snapshot.providers[0]?.inquiryUrl === undefined) {
    return false
  }
  if (snapshot.layoutProfile !== 'discovery_full') {
    return false
  }
  return /\b(asap|contact|emergency|help|inquiry|need|quote|today|tonight|tomorrow|urgent)\b/i.test(snapshot.query)
}

function extractTimingLabel(query: string): string | undefined {
  if (/\btoday\b/i.test(query)) {
    return 'today if available'
  }
  if (/\btonight\b/i.test(query)) {
    return 'tonight if available'
  }
  if (/\btomorrow\b/i.test(query)) {
    return 'tomorrow if available'
  }
  if (/\b(asap|urgent|emergency)\b/i.test(query)) {
    return 'as soon as the business can confirm'
  }
  return undefined
}

function buildRecoveryPrompts(query: string): { label: string; query: string }[] {
  const normalized = query.trim()
  const base = normalized.length > 0 ? normalized : 'local service'
  return [
    { label: 'Search a nearby suburb', query: `${base} near me` },
    { label: 'Try the service type only', query: stripPlaceWords(base) },
    { label: 'Browse listed businesses', query: base },
  ]
}

function stripPlaceWords(query: string): string {
  const stripped = query
    .replace(/\bnear\s+[A-Za-z][A-Za-z\s'-]*$/i, '')
    .replace(/\bin\s+[A-Za-z][A-Za-z\s'-]*$/i, '')
    .replace(/\b\d{4}\b/g, '')
    .trim()
  return stripped.length > 0 ? stripped : query
}

export function buildAgentJsonUrlForQuery(query: string, limit?: number): string {
  return buildAgentJsonUrl(query, limit)
}
