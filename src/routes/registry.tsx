import { z } from 'zod'
import { createFileRoute, redirect } from '@tanstack/react-router'

const legacySearchSchema = z.object({ q: z.string().optional() })

export const Route = createFileRoute('/registry')({
  beforeLoad: ({ search }) => {
    const parsed = legacySearchSchema.safeParse(search)
    const query = parsed.success ? parsed.data.q?.trim().slice(0, 120) ?? '' : ''
    throw redirect({
      to: '/',
      ...(parsed.success && parsed.data.q !== undefined ? { search: { q: query } } : {}),
      statusCode: 301,
    })
  },
})
