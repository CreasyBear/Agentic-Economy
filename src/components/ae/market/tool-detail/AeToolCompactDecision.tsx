import { Link } from '@tanstack/react-router'
import { CheckIcon, CopyIcon } from 'lucide-react'

import { AeToolPrice } from '@/components/ae/market/AeToolPrice'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { Separator } from '@/components/ui/separator'
import { useClipboardCopy } from '@/hooks/use-clipboard-copy'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'

import { AeToolFacts } from './AeToolFacts'
import {
  nextActionCode,
  type ToolInspectorModel,
} from './tool-inspector-model'

export function AeToolCompactDecision({
  tool,
  model,
  onNavigate,
}: Readonly<{
  tool: PublicToolDescriptor
  model: ToolInspectorModel
  onNavigate?: () => void
}>) {
  const code = nextActionCode(model)
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
              {model.nextActionDescription}
            </ItemDescription>
          </div>
          <AeToolPrice
            price={model.totalPrice}
            size="sm"
            label="Indicative price"
            className="shrink-0 place-items-end"
          />
        </div>

        <Separator />
        <AeToolFacts tool={tool} model={model} variant="compact" />

        {model.nextAction.kind === 'navigate' && model.nextAction.href !== undefined ? (
          <Button asChild size="sm" className="min-h-touch justify-self-start">
            <Link to={model.nextAction.href} onClick={onNavigate}>{model.nextAction.label}</Link>
          </Button>
        ) : code !== undefined ? (
          <div className="flex items-center gap-intra">
            <Button
              type="button"
              size="sm"
              className="min-h-touch"
              aria-label={isCopied
                ? `${model.nextAction.label} copied`
                : `Copy ${model.nextAction.label}`}
              onClick={() => { void copy() }}
            >
              {isCopied ? (
                <CheckIcon aria-hidden="true" data-icon="inline-start" />
              ) : (
                <CopyIcon aria-hidden="true" data-icon="inline-start" />
              )}
              {isCopied ? 'Copied' : model.nextAction.label}
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

function decisionVariant(model: ToolInspectorModel): 'success' | 'warning' | 'outline' {
  if (model.nextAction.label === 'Tool reference') return 'success'
  if (model.availabilityPosture === 'setup_required') {
    return 'warning'
  }
  return 'outline'
}
