import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'

export function AeAgentQuickstartStep({
  number,
  title,
  access,
  command,
  body,
}: Readonly<{
  number: string
  title: string
  access: string
  command: string
  body: string
}>) {
  return (
    <article className="grid content-start gap-3 py-5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3"><span className="font-mono text-xs text-muted-foreground">{number}</span><span className="text-xs font-medium text-muted-foreground">{access}</span></div>
      <div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p></div>
      <AeCopyCommand className="mt-auto" compact label={`${title} command`} code={command} />
    </article>
  )
}

export function AeAgentReferenceList({
  title,
  items,
}: Readonly<{
  title: string
  items: readonly { command: string; route: string; description: string }[]
}>) {
  return (
    <section className="grid gap-3">
      <h2 className="font-semibold">{title}</h2>
      <dl className="divide-y rounded-lg border">
        {items.map((item) => (
          <div key={item.command} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1fr)] md:items-start md:gap-5">
            <dt><AeCopyCommand compact label={`${title} command`} code={item.command} /></dt>
            <dd className="grid min-w-0 gap-1 text-sm text-muted-foreground"><code className="break-words font-mono text-xs">{item.route}</code><span>{item.description}</span></dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
