import { parseNarrowToSuburb } from '@/modules/common/narrow-to-chip'

const LOCATION_HINTS = /\b(near|around|in|at|directions? to|close to|local)\b/i
const AU_POSTCODE = /\b(\d{4})\b/
const SUBURB_WORDS = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g

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

  const postcodeMatch = trimmed.match(AU_POSTCODE)
  if (postcodeMatch !== null) {
    const postcode = postcodeMatch[1] ?? ''
    const suburb = extractSuburbBeforePostcode(trimmed, postcode)
    const label = suburb.length > 0 ? `${suburb} ${postcode}, Australia` : `Postcode ${postcode}, Australia`
    return { placeQuery: label, label: suburb.length > 0 ? `${suburb} ${postcode}` : postcode }
  }

  if (!LOCATION_HINTS.test(trimmed)) {
    const capitalized = trimmed.match(SUBURB_WORDS)
    if (capitalized === null || capitalized.length < 2) {
      const trailingPlace = extractPlacePhrase(trimmed)
      if (trailingPlace.length === 0) {
        return undefined
      }
      return {
        placeQuery: `${trailingPlace}, Australia`,
        label: trailingPlace,
      }
    }
  }

  const place = extractPlacePhrase(trimmed)
  if (place.length === 0) {
    return undefined
  }

  return {
    placeQuery: `${place}, Australia`,
    label: place,
  }
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
  const inMatch = query.match(/\b(?:in|near|around|at)\s+(.+?)(?:\?|$)/i)
  if (inMatch?.[1] !== undefined) {
    return inMatch[1].trim().replace(/\s+(please|today|now|urgent)$/i, '')
  }

  const tokens = query.split(/\s+/).filter(Boolean)
  if (tokens.length >= 2 && tokens[0]?.toLowerCase() === 'narrow' && tokens[1]?.toLowerCase() === 'to') {
    return ''
  }

  const tail = tokens.slice(-1).join(' ')
  return tail.length >= 3 ? tail : ''
}
