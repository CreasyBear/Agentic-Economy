import type { ReactNode } from 'react'

export type AeProseBlockProps = {
  id?: string
  title: string
  children: ReactNode
}
export function AeProseBlock({ id, title, children }: AeProseBlockProps) {
  const headingSlug = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section'
  const headingId = id ?? `ae-prose-${headingSlug}`

  return (
    <section className="grid gap-3" aria-labelledby={headingId}>
      <h2 id={headingId} className="font-heading text-xl font-semibold tracking-tight">{title}</h2>
      <div className="grid gap-3 text-pretty leading-7 text-muted-foreground">{children}</div>
    </section>
  )
}
