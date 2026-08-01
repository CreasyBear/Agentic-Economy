import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { jsonResponse } from './api.businesses'

const ADELAIDE_TIME_ZONE = 'Australia/Adelaide'
const QUOTE_VALIDITY_MS = 30 * 60_000
const adelaideDateTime = new Intl.DateTimeFormat('en-AU', {
  timeZone: ADELAIDE_TIME_ZONE,
  year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
})
const servicePrices = {
  'home-office-video-setup': 18_900,
  'remote-tech-check': 7_900,
} as const

const quoteInputSchema = z.object({
  service: z.enum(['home-office-video-setup', 'remote-tech-check']).default('home-office-video-setup'),
  postcode: z.string().regex(/^\d{4}$/).optional(),
}).default({ service: 'home-office-video-setup' })

export const Route = createFileRoute('/api/demo-provider/quote')({
  server: {
    handlers: {
      HEAD: () => new Response(null, { status: 204 }),
      POST: ({ request }) => handleDemoProviderQuoteRequest(request),
    },
  },
})

export async function handleDemoProviderQuoteRequest(
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ kind: 'refused', reason: 'invalid_request' }, { status: 400 })
  }
  const input = quoteInputSchema.safeParse(body)
  if (!input.success) {
    return jsonResponse({ kind: 'refused', reason: 'invalid_request' }, { status: 400 })
  }

  const nextSlot = nextAdelaideBusinessSlot(now)
  const amountMinor = servicePrices[input.data.service]
  const validUntil = new Date(now.getTime() + QUOTE_VALIDITY_MS).toISOString()
  return jsonResponse({
    kind: 'quoted',
    quoteRef: `ae-demo:${input.data.service}:${nextSlot}`,
    service: input.data.service,
    expectedCost: { currency: 'AUD', amountMinor },
    maximumCost: { currency: 'AUD', amountMinor },
    expectedLatencyMs: 250,
    dataFields: input.data.postcode === undefined ? ['service'] : ['service', 'postcode'],
    disclosures: input.data.postcode === undefined ? [] : ['postcode'],
    availability: {
      nextSlot,
      durationMinutes: input.data.service === 'home-office-video-setup' ? 90 : 45,
      timeZone: ADELAIDE_TIME_ZONE,
    },
    validUntil,
    terms: ['Fixed call-out price for the selected service.', 'Final scope is confirmed before work starts.'],
  })
}

export function nextAdelaideBusinessSlot(now: Date): string {
  const local = localParts(now)
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day))
  let hour = local.hour < 9 ? 9 : local.hour + 1
  if (isWeekday(date) && hour < 17) {
    return localDateTimeToUtc(date, hour).toISOString()
  }

  do date.setUTCDate(date.getUTCDate() + 1)
  while (!isWeekday(date))
  return localDateTimeToUtc(date, 9).toISOString()
}

function localDateTimeToUtc(date: Date, hour: number): Date {
  const targetLocalMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour)
  let utcMs = targetLocalMs
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const represented = localParts(new Date(utcMs))
    const representedLocalMs = Date.UTC(
      represented.year, represented.month - 1, represented.day, represented.hour, represented.minute,
    )
    utcMs = targetLocalMs - (representedLocalMs - utcMs)
  }
  return new Date(utcMs)
}

function localParts(date: Date): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
} {
  const parts = adelaideDateTime.formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute') }
}

function isWeekday(date: Date): boolean {
  const day = date.getUTCDay()
  return day >= 1 && day <= 5
}
