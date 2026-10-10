import type { ReactNode } from 'react'

/** Licensed ReUI profile-8/settings-section adapted to sourced Account credit. */
export function CreditProfileSection({ title, description, children }: Readonly<{
  title: string; description: string; children: ReactNode
}>) {
  return <section className="flex min-w-0 flex-col gap-5" aria-label={title}>
    <div className="flex flex-col gap-px"><h2 className="text-base font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p></div>
    {children}
  </section>
}
