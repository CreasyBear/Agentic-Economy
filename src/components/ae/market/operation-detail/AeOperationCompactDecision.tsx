import { Link } from '@tanstack/react-router'
import { CheckIcon, CopyIcon } from 'lucide-react'

import { AeOperationPrice } from '@/components/ae/market/AeOperationPrice'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { Separator } from '@/components/ui/separator'
import { useClipboardCopy } from '@/hooks/use-clipboard-copy'
import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'

import { AeOperationFacts } from './AeOperationFacts'
import {
  continuationCode,
  type OperationInspectorModel,
} from './operation-inspector-model'

export function AeOperationCompactDecision({
  operation,
  model,
  onNavigate,
}: Readonly<{
  operation: PublicOperationDescriptor
  model: OperationInspectorModel
  onNavigate?: () => void
}>) {
  const code = continuationCode(model)
  const { status, isCopied, copy } = useClipboardCopy(code ?? '', { timeout: 1_600 })

  return (
    <Item
      role="region"
      aria-label={model.decisionLabel}
      variant="outline"
      size="sm"
      className="items-start"
    >
      <ItemContent className="basis-full gap-related">
        <div className="flex min-w-0 items-start justify-between gap-related">
          <div className="grid min-w-0 gap-intra">
            <ItemTitle>
              <Badge variant={decisionVariant(model)}>{model.decisionLabel}</Badge>
            </ItemTitle>
            <ItemDescription className="line-clamp-none text-pretty">
              {model.continuationDescription}
            </ItemDescription>
          </div>
          <AeOperationPrice
            price={model.totalPrice}
            size="sm"
            label="Indicative price"
            className="shrink-0 place-items-end"
          />
        </div>

        <Separator />
        <AeOperationFacts operation={operation} model={model} variant="compact" />

        {model.continuation.kind === 'navigate' && model.continuation.href !== undefined ? (
          <Button asChild size="sm" className="min-h-touch justify-self-start">
            <Link to={model.continuation.href} onClick={onNavigate}>{model.continuation.label}</Link>
          </Button>
        ) : code !== undefined ? (
          <div className="flex items-center gap-intra">
            <Button
              type="button"
              size="sm"
              className="min-h-touch"
              aria-label={isCopied
                ? `${model.continuation.label} copied`
                : `Copy ${model.continuation.label}`}
              onClick={() => { void copy() }}
            >
              {isCopied ? (
                <CheckIcon aria-hidden="true" data-icon="inline-start" />
              ) : (
                <CopyIcon aria-hidden="true" data-icon="inline-start" />
              )}
              {isCopied ? 'Copied' : model.continuation.label}
            </Button>
            <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
              {status === 'failed' ? 'Copy failed. Open Actions to copy the command manually.' : ''}
            </span>
          </div>
        ) : null}
      </ItemContent>
    </Item>
  )
}

function decisionVariant(model: OperationInspectorModel): 'success' | 'warning' | 'outline' {
  if (model.continuation.label === 'Operation reference') return 'success'
  if (model.availabilityPosture === 'setup_required') {
    return 'warning'
  }
  return 'outline'
}
