import { Separator } from '@/components/ui/separator'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import { toolDisplayTitle } from '@/modules/market/tool-view-model'

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
          {toolDisplayTitle(tool)}
        </h2>
        <p className="text-xs text-muted-foreground">
          {tool.business.name} · {tool.contract.capabilityId}
        </p>
      </div>
      <Separator />
    </header>
  )
}
