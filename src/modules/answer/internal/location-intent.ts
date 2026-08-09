import { parseNarrowToSuburb } from '@/modules/common/narrow-to-chip'

const LOCATION_HINTS = /\b(?:near|around|in|at|serving|close\s+to|directions?\s+to)\b/i
const LOCATION_MARKER = /\b(?:near|around|in|at|serving|close\s+to|directions?\s+to)\s+/i
const AU_POSTCODE = /\b(\d{4})\b/
const AU_STATES: Record<string, true> = {
  act: true,
  nsw: true,
  nt: true,
  qld: true,
  sa: true,
  tas: true,
  vic: true,
  wa: true,
}
const TRAILING_PROPER_PLACE = /^[A-Z][A-Za-z'’-]*$/

// These words start the rest of the request rather than the place itself.
// Keep the list deliberately clause-shaped: a place may contain words such as
// "the", but "tonight", "under", or "without" cannot be part of one.
const LOCATION_CLAUSE_WORDS: Record<string, true> = {
  accept: true,
  accepts: true,
  after: true,
  and: true,
  asap: true,
  available: true,
  before: true,
  but: true,
  can: true,
  compare: true,
  confirm: true,
  cost: true,
  could: true,
  excluding: true,
  explain: true,
  for: true,
  from: true,
  has: true,
  have: true,
  help: true,
  immediately: true,
  including: true,
  need: true,
  needs: true,
  next: true,
  not: true,
  now: true,
  only: true,
  open: true,
  or: true,
  over: true,
  please: true,
  price: true,
  same: true,
  show: true,
  take: true,
  taking: true,
  tell: true,
  this: true,
  through: true,
  today: true,
  tomorrow: true,
  tonight: true,
  under: true,
  until: true,
  urgent: true,
  urgently: true,
  want: true,
  what: true,
  which: true,
  who: true,
  within: true,
  without: true,
  apart: true,
  around: true,
  at: true,
  availability: true,
  besides: true,
  budget: true,
  business: true,
  businesses: true,
  catalog: true,
  catalogue: true,
  cleaner: true,
  cleaning: true,
  dentist: true,
  dental: true,
  directory: true,
  electrician: true,
  electrical: true,
  emergency: true,
  exclude: true,
  excluded: true,
  except: true,
  hours: true,
  hour: true,
  in: true,
  lawyer: true,
  locksmith: true,
  mechanic: true,
  near: true,
  on: true,
  other: true,
  photographer: true,
  plumber: true,
  plumbing: true,
  provider: true,
  providers: true,
  repair: true,
  right: true,
  repairs: true,
  service: true,
  services: true,
  to: true,
  trade: true,
  trades: true,
  tutor: true,
  tutoring: true,
  weekday: true,
  weekdays: true,
  weekend: true,
  weekends: true,
  addition: true,
  afternoon: true,
  day: true,
  days: true,
  evening: true,
  general: true,
  market: true,
  meantime: true,
  morning: true,
  month: true,
  months: true,
  night: true,
  relation: true,
  regard: true,
  respect: true,
  system: true,
  week: true,
  weeks: true,
  an: true,
  any: true,
  city: true,
  early: true,
  hurry: true,
  late: true,
  neighborhood: true,
  our: true,
  rush: true,
  some: true,
  suburb: true,
  town: true,
  their: true,
  call: true,
  callouts: true,
  calls: true,
  needing: true,
  no: true,
  requiring: true,
  subject: true,
  that: true,
  unless: true,
  where: true,
  when: true,
  whether: true,
  with: true,
}

const NON_LOCATION_PHRASES: Record<string, true> = {
  a: true,
  advance: true,
  anywhere: true,
  area: true,
  between: true,
  case: true,
  demand: true,
  here: true,
  home: true,
  inquiries: true,
  location: true,
  me: true,
  my: true,
  need: true,
  order: true,
  person: true,
  place: true,
  progress: true,
  region: true,
  there: true,
  the: true,
  time: true,
  vicinity: true,
  work: true,
  your: true,
}

export type LocationIntent = {
  placeQuery: string
  label: string
}

export function parseLocationIntent(query: string): LocationIntent | undefined {
  const trimmed = query.trim()
  if (trimmed.length === 0) {
    return undefined
  }

  if (parseNarrowToSuburb(trimmed) !== undefined) {
    return undefined
  }

  const explicit = parseExplicitLocationIntent(trimmed)
  if (explicit !== undefined) {
    return explicit
  }

  const trailingPlace = extractPlacePhrase(trimmed)
  if (trailingPlace.length === 0) {
    return undefined
  }
  return {
    placeQuery: `${trailingPlace}, Australia`,
    label: trailingPlace,
  }
}

export function parseExplicitLocationIntent(query: string): LocationIntent | undefined {
  const postcodeMatch = query.match(AU_POSTCODE)
  if (postcodeMatch !== null) {
    const postcode = postcodeMatch[1] ?? ''
    const suburb = extractSuburbBeforePostcode(query, postcode)
    const label = suburb.length > 0 ? `${suburb} ${postcode}, Australia` : `Postcode ${postcode}, Australia`
    return { placeQuery: label, label: suburb.length > 0 ? `${suburb} ${postcode}` : postcode }
  }

  if (!LOCATION_HINTS.test(query)) {
    return undefined
  }

  const place = extractPlacePhrase(query)
  return place.length === 0
    ? undefined
    : { placeQuery: `${place}, Australia`, label: place }
}

function extractSuburbBeforePostcode(query: string, postcode: string): string {
  const index = query.indexOf(postcode)
  if (index <= 0) {
    return ''
  }

  const before = query.slice(0, index).trim()
  const explicit = extractPlacePhrase(before)
  if (explicit.length > 0) {
    return explicit
  }

  const tokens = before
    .split(/\s+/)
    .map(stripTokenPunctuation)
    .filter(Boolean)
  const placeTokens: string[] = []
  for (const token of tokens.reverse()) {
    if (AU_STATES[token.toLowerCase()] === true) {
      continue
    }
    if (!TRAILING_PROPER_PLACE.test(token)) {
      break
    }
    placeTokens.unshift(token)
  }
  return placeTokens.join(' ')
}

function extractPlacePhrase(query: string): string {
  const marker = query.match(LOCATION_MARKER)
  if (marker?.index !== undefined) {
    const start = marker.index + marker[0].length
    const candidate = trimLocationClause(query.slice(start))
    return isUsablePlacePhrase(candidate) ? candidate : ''
  }

  const tokens = query.split(/\s+/).map(stripTokenPunctuation).filter(Boolean)
  const placeTokens: string[] = []
  for (const token of tokens.reverse()) {
    if (!TRAILING_PROPER_PLACE.test(token)) {
      break
    }
    placeTokens.unshift(token)
  }
  return placeTokens.join(' ')
}

function trimLocationClause(value: string): string {
  const placeTokens: string[] = []
  for (const rawToken of value.split(/\s+/)) {
    const token = stripTokenPunctuation(rawToken)
    if (token.length === 0) {
      continue
    }
    const normalized = token.toLowerCase()
    if (LOCATION_CLAUSE_WORDS[normalized] === true) {
      break
    }
    placeTokens.push(token)
  }
  return placeTokens.join(' ')
}

function isUsablePlacePhrase(candidate: string): boolean {
  const normalized = candidate.toLowerCase()
  if (candidate.length === 0 || NON_LOCATION_PHRASES[normalized] === true) {
    return false
  }

  const tokens = candidate.split(/\s+/).filter(Boolean)
  if (tokens.length > 3) {
    return false
  }

  // Reject phrases made entirely of generic prose while still allowing
  // lowercase user-entered suburb names such as "sydney".
  if (tokens.every((token) => NON_LOCATION_PHRASES[token.toLowerCase()] === true)) {
    return false
  }
  return true
}

function stripTokenPunctuation(token: string): string {
  return token.replace(/^[,.;:!?]+|[,.;:!?]+$/g, '')
}
