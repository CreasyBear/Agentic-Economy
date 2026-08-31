import { Separator } from '@/components/ui/separator'
import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'

export function AeOperationIdentity({
  operation,
  variant,
}: Readonly<{
  operation: PublicOperationDescriptor
  variant: 'compact' | 'full'
}>) {
  if (variant === 'full') {
    return <p className="text-sm text-muted-foreground">{operation.business.name}</p>
  }

  return (
    <header className="grid gap-intra px-gutter pb-related pt-intra">
      <div className="grid min-w-0 gap-0.5">
        <h2 className="text-base font-semibold text-foreground">
          {operation.offering.label}
        </h2>
        <p className="text-xs text-muted-foreground">
          {operation.business.name} · {operation.contract.capabilityId}
        </p>
      </div>
      <code dir="ltr" className="break-all font-mono text-xs text-muted-foreground">
        {operation.operationRef}
      </code>
      <Separator />
    </header>
  )
}
