import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

/**
 * One title and one supporting line for a directory listing, used by every card, table row,
 * tool page and route head. A row of cards keeps one silhouette: two-line titles, two-line
 * summaries. A title is never cut with an ellipsis when an honest cut exists.
 */
const TITLE_MAX = 40
const TITLE_ALONE_MAX = 70
const SUMMARY_MAX = 70
const SERVICE_TITLE_MAX = 40
/** Query strings, enums and markup are API docs, not a sentence a stranger reads. */
const CODE_LIKE = /\?\w+=|[=|{}<>_]|\(\w+\|/u
/** A long title keeps its job and drops its trailing qualifier ("Hyperliquid market data for…" becomes "Hyperliquid market data"). */
const TITLE_CLAUSE = / (?:with|for|from|via|using|including) /giu
/** "Omni Terminal delivers fresh news…" names the brand twice on a card that already shows it; lead with the job. */
const BRAND_LEAD = /^(?:[A-Z][\w.'-]*\s){1,3}(?:delivers|renders|returns|provides|offers|gives|fetches|serves)\s+/u
const NO_DESCRIPTION = 'The provider has not supplied a description.'

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
/** Provider copy is theirs, but the page keeps Arc's punctuation: dashes become commas, a trailing one goes. */
const plain = (text: string) => text.replace(/\s*[—–]\s*/gu, ', ').replace(/[,\s]+$/u, '')

export const readableCardText = (text: string | undefined): text is string => text !== undefined && text !== '' && !CODE_LIKE.test(text)

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/gu, ' ').trim().replace(/[…,;:\s]+$/u, '')
  if (clean.length <= max) return text.trim().endsWith('…') ? `${clean}…` : clean
  const cut = clean.slice(0, max)
  const boundary = cut.lastIndexOf(' ')
  return `${(boundary > max / 2 ? cut.slice(0, boundary) : cut).replace(/[,;:.\s]+$/u, '')}…`
}

/** Source descriptions are often cut at a fixed width; end a cut one at its last whole word. */
function settleCut(text: string): string {
  if (/[.!?)\]"'’]$/u.test(text)) return text
  const boundary = text.lastIndexOf(' ')
  return boundary > text.length / 2 ? `${text.slice(0, boundary).replace(/[,;:.\s]+$/u, '')}…` : text
}

/** A glance taken from the source description may be cut mid-word; a generated "Returns …" line is whole. */
const settleGlance = (entry: X402DirectoryEntry, glance: string) => glance === entry.description.trim() ? settleCut(glance) : glance

function withoutBrandLead(text: string): string {
  const stripped = text.replace(BRAND_LEAD, '')
  return stripped === text ? text : capitalise(stripped)
}

/** A title that fits, cut before a trailing clause when it is too long; undefined when no honest cut exists. */
function fitTitle(text: string, max: number): string | undefined {
  const clean = text.replace(/\s+/gu, ' ').trim().replace(/[…,;:.\s]+$/u, '')
  if (clean.length <= max && !text.trim().endsWith('…')) return capitalise(clean)
  const cuts = [...clean.slice(0, max + 1).matchAll(TITLE_CLAUSE)].map(match => match.index).filter(index => index >= 12)
  const cut = cuts.at(-1)
  return cut === undefined ? undefined : capitalise(clean.slice(0, cut))
}

const startsAlike = (text: string, lead: string) => text.toLowerCase().startsWith(lead.toLowerCase().replace(/…$/u, '').slice(0, 24))

/** "weather-now" reads as "Weather now"; a brand name keeps its own casing. */
function humanise(name: string): string {
  if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u.test(name)) return name
  return capitalise(name.replace(/[-_]+/gu, ' '))
}

/**
 * Directory titles are often the description cut at a fixed width. Use a real short name when
 * the listing has one, otherwise the description, split "Name: what it returns" where it can.
 * A one-word prefix is usually the brand ("GenesisBlock: …"), so the clause leads.
 */
function honestCopy(entry: X402DirectoryEntry, rawTitle: string, glance: string | undefined): { title: string; summary?: string } | undefined {
  const stem = rawTitle.replace(/…$/u, '').trim()
  const description = entry.description.trim()
  const full = withoutBrandLead(settleCut(description.startsWith(stem) ? description : rawTitle))
  const fallback = glance !== undefined && !startsAlike(full, glance) ? clip(settleGlance(entry, glance), SUMMARY_MAX) : undefined
  const copy = (title: string | undefined, summary?: string) => {
    const heading = title?.replace(/[,;:\s]+$/u, '')
    if (heading === undefined || heading === '') return undefined
    // A summary that only repeats the title, in any case, says nothing new.
    const shown = [summary, fallback].find(text => readableCardText(text) && !startsAlike(text, heading))
    return { title: heading, ...(shown === undefined ? {} : { summary: shown }) }
  }
  const colon = full.indexOf(': ')
  if (colon >= 3 && colon <= TITLE_MAX) {
    const head = full.slice(0, colon)
    const rest = capitalise(full.slice(colon + 2))
    if (head.includes(' ')) return copy(head, clip(rest, SUMMARY_MAX))
    return copy(fitTitle(rest, fallback === undefined ? TITLE_ALONE_MAX : TITLE_MAX))
  }
  const named = rawTitle.length <= TITLE_MAX && !rawTitle.endsWith('…') && !full.startsWith(stem)
  if (named) return copy(capitalise(rawTitle), clip(full, SUMMARY_MAX))
  // A short first sentence is the name; the rest is the supporting line. Headings drop the full stop.
  const sentence = /^(.{8,40}?[.?!])\s+(\S.*)$/u.exec(full)
  if (sentence?.[1] !== undefined && sentence[2] !== undefined) {
    return copy(capitalise(sentence[1].replace(/\.$/u, '')), clip(capitalise(sentence[2]), SUMMARY_MAX))
  }
  return copy(fitTitle(full, fallback === undefined ? TITLE_ALONE_MAX : TITLE_MAX))
}

/**
 * The card's title and summary. Without an honest cut, the listing's own words clipped at a word (so sibling
 * listings from one service stay distinct), then a short service name when those words are code.
 */
export function directoryCardCopy(entry: X402DirectoryEntry, rawTitle: string, glance: string | undefined): { title: string; summary?: string } {
  const honest = honestCopy(entry, rawTitle, glance)
  if (honest !== undefined && readableCardText(honest.title)) {
    return { title: plain(honest.title), ...(honest.summary === undefined ? {} : { summary: plain(honest.summary) }) }
  }
  const stem = rawTitle.replace(/…$/u, '').trim()
  const description = entry.description.trim()
  const source = withoutBrandLead(settleCut(description.startsWith(stem) && description !== NO_DESCRIPTION ? description : rawTitle))
  const words = fitTitle(source, TITLE_ALONE_MAX) ?? capitalise(clip(source, TITLE_ALONE_MAX))
  const service = entry.serviceName?.trim()
  const title = readableCardText(words) ? words
    : service !== undefined && service.length > 0 && service.length <= SERVICE_TITLE_MAX ? humanise(service) : words
  const summary = honest?.summary ?? (glance === undefined ? undefined : clip(settleGlance(entry, glance), SUMMARY_MAX))
  return { title: plain(title), ...(readableCardText(summary) && !startsAlike(summary, title) ? { summary: plain(summary) } : {}) }
}

/**
 * The tool page's lede: the provider's whole description, minus the opening clause the title already
 * says. A title cut mid-sentence keeps the full description, so the lede never starts mid-thought.
 */
export function directoryLede(entry: X402DirectoryEntry, title: string): string | undefined {
  const description = plain(entry.description.trim())
  if (description === '' || description === NO_DESCRIPTION) return undefined
  const stem = title.replace(/…$/u, '').trim().toLowerCase()
  for (const candidate of [description, description.replace(/^[^\s:]{1,40}:\s+/u, '')]) {
    if (!candidate.toLowerCase().startsWith(stem)) continue
    const after = candidate.slice(stem.length)
    if (after !== '' && !/^(?:[.!?;:,]|\s+[-,]\s)/u.test(after)) break
    const rest = after.replace(/^[.!?;:,\s-]+/u, '').trim()
    return rest === '' ? undefined : capitalise(rest)
  }
  return description
}
