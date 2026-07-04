const SERVICE_PHRASES = [
  'after hours plumber',
  'emergency plumber',
  'emergency plumbing',
  'gas fitter',
  'hot water plumber',
  'locksmith',
  'mobile mechanic',
  'pool cleaner',
]

const SERVICE_WORDS = new Set(
  SERVICE_PHRASES.flatMap((phrase) => phrase.split(' ')).concat([
    'after',
    'around',
    'business',
    'businesses',
    'find',
    'for',
    'in',
    'near',
    'open',
    'provider',
    'providers',
    'service',
    'services',
    'the',
    'to',
  ]),
)

const KNOWN_PLACES = new Set(['brunswick', 'footscray', 'parramatta', 'perth'])

export function resolveRetrievalPlan(query, context) {
  const displayQuery = normalizeSpaces(query).slice(0, 200)
  const base = {
    displayQuery,
    serviceQuery: displayQuery,
    scope: context?.mode === 'whole_catalogue' ? 'whole_catalogue' : 'near_me',
    locationSource: 'none',
    wasContextInjected: false,
    resolvedAt: new Date(0).toISOString(),
  }

  if (displayQuery.length === 0) {
    return { ...base, reason: 'invalid_query' }
  }

  if (context?.mode === 'whole_catalogue' || context?.allowOutsideArea === true) {
    return { ...base, scope: 'whole_catalogue', reason: 'whole_catalogue' }
  }

  const explicit = explicitPlace(displayQuery)
  if (explicit !== undefined) {
    return {
      ...base,
      locationConstraint: explicit,
      locationSource: 'user_query',
      reason: 'user_place_applied',
    }
  }

  if (hasMultipleKnownPlaces(displayQuery)) {
    return { ...base, reason: 'multi_place_query_preserved' }
  }

  if (hasKnownPlace(displayQuery) || hasUnknownPlaceLikeEdgeToken(displayQuery)) {
    return { ...base, reason: 'place_like_query_preserved' }
  }

  const contextLabel = context?.location?.label?.trim()
  if (contextLabel === undefined || contextLabel.length === 0 || context?.location?.countryCode !== 'AU') {
    return { ...base, reason: 'invalid_context' }
  }

  return {
    ...base,
    locationConstraint: contextLabel,
    locationSource: 'search_context',
    wasContextInjected: true,
    reason: 'context_place_applied',
  }
}

function normalizeSpaces(value) {
  return String(value).trim().replace(/\s+/g, ' ')
}

function words(value) {
  return normalizeSpaces(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function explicitPlace(query) {
  const match = query.match(/\b(?:in|near|around)\s+([a-z][a-z\s'-]{1,80})(?:\?|$)/i)
  if (match?.[1] === undefined) return undefined
  return titleCase(trimServiceWords(words(match[1])).join(' '))
}

function trimServiceWords(tokens) {
  let start = 0
  let end = tokens.length
  while (start < end && SERVICE_WORDS.has(tokens[start])) start += 1
  while (end > start && SERVICE_WORDS.has(tokens[end - 1])) end -= 1
  return tokens.slice(start, end)
}

function hasKnownPlace(query) {
  return words(query).some((token) => KNOWN_PLACES.has(token))
}

function hasMultipleKnownPlaces(query) {
  return words(query).filter((token) => KNOWN_PLACES.has(token)).length > 1
}

function hasUnknownPlaceLikeEdgeToken(query) {
  const tokens = words(query)
  const edgeTokens = [tokens[0], tokens[tokens.length - 1]].filter(Boolean)
  return edgeTokens.some((token) => token.length >= 4 && !SERVICE_WORDS.has(token) && !KNOWN_PLACES.has(token))
}

function titleCase(value) {
  if (value.length === 0) return undefined
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const defaultContext = {
  mode: 'near_me',
  allowOutsideArea: false,
  location: { label: 'Perth, WA', suburb: 'Perth', stateTerritory: 'WA', countryCode: 'AU' },
}

const fixtures = [
  ['Emergency plumber', defaultContext, 'context_place_applied', 'Perth, WA'],
  ['Emergency plumber Brunswick', defaultContext, 'place_like_query_preserved', undefined],
  ['paramata plumber', defaultContext, 'place_like_query_preserved', undefined],
  ['hot water plumber', defaultContext, 'context_place_applied', 'Perth, WA'],
  ['gas fitter', defaultContext, 'context_place_applied', 'Perth, WA'],
  ['pool cleaner', defaultContext, 'context_place_applied', 'Perth, WA'],
  ['after hours plumber', defaultContext, 'context_place_applied', 'Perth, WA'],
  ['mobile mechanic', defaultContext, 'context_place_applied', 'Perth, WA'],
  ['Emergency plumber', { mode: 'whole_catalogue', allowOutsideArea: true }, 'whole_catalogue', undefined],
]

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = fixtures.map(([query, context, reason, locationConstraint]) => {
    const plan = resolveRetrievalPlan(query, context)
    return {
      query,
      pass: plan.reason === reason && plan.locationConstraint === locationConstraint,
      expected: { reason, locationConstraint },
      actual: plan,
    }
  })

  console.table(results.map(({ query, pass, actual }) => ({
    query,
    pass,
    reason: actual.reason,
    location: actual.locationConstraint ?? '',
    source: actual.locationSource,
  })))

  const failed = results.filter((result) => !result.pass)
  if (failed.length > 0) {
    console.error(JSON.stringify(failed, null, 2))
    process.exit(1)
  }
}
