import { parseNarrowToSuburb } from '@/modules/common/narrow-to-chip'

const LOCATION_HINTS = /\b(near|around|in|at|serving|directions? to|close to|local)\b/i
const AU_POSTCODE = /\b(\d{4})\b/
const TRAILING_PROPER_PLACE = /^[A-Z][a-z]+$/

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
  const tokens = before.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return ''
  }
  return tokens.slice(-2).join(' ')
}

function extractPlacePhrase(query: string): string {
  const inMatch = query.match(/\b(?:in|near|around|at|serving)\s+(.+?)(?:\?|$)/i)
  if (inMatch?.[1] !== undefined) {
    return inMatch[1].trim().replace(
      /\s+(?:please|today|tonight|now|urgent(?:ly)?|immediately|this week|next week|and\s+(?:tell|show|compare|explain|help)\b.*)$/i,
      '',
    )
  }

  const tokens = query.split(/\s+/).filter(Boolean)
  const tail = tokens.at(-1)?.replace(/[?!.,]+$/, '') ?? ''
  return TRAILING_PROPER_PLACE.test(tail) ? tail : ''
}
