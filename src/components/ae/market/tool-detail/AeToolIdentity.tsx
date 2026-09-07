import { Separator } from '@/components/ui/separator'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'

export function AeToolIdentity({
  tool,
  variant,
}: Readonly<{
  tool: PublicToolDescriptor
  variant: 'compact' | 'full'
}>) {
  if (variant === 'full') {
    return <p className="text-sm text-muted-foreground">{tool.business.name}</p>
  }

  return (
    <header className="grid gap-intra px-gutter pb-related pt-intra">
      <div className="grid min-w-0 gap-0.5">
        <h2 className="text-base font-semibold text-foreground">
          {tool.offering.label}
        </h2>
        <p className="text-xs text-muted-foreground">
          {tool.business.name} · {tool.contract.capabilityId}
        </p>
      </div>
      <code dir="ltr" className="break-all font-mono text-xs text-muted-foreground">
        {tool.toolRef}
      </code>
      <Separator />
    </header>
  )
}
