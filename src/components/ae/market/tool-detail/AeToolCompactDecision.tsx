import { Link } from '@tanstack/react-router'
import { AeToolPrice } from '@/components/ae/market/AeToolPrice'
import { Badge } from '@/components/ui/badge'
import { AeCopyValue } from '@/components/ae/shared/copy-value/AeCopyValue'
import { DecisionPanel } from '@/components/arc/chat/DecisionPanel'
import buttonStyles from '@/components/arc/button/button.module.css'
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
  return (
    <DecisionPanel
      role="region"
      aria-label={model.decisionLabel}
    >
      <header className="arc-decision-header">
        <div className="arc-decision-heading-group">
          <h3 className="arc-decision-heading">
            <Badge variant={decisionVariant(model)}>{model.decisionLabel}</Badge>
          </h3>
          <p className="text-sm text-muted-foreground">
            {model.nextActionDescription}
          </p>
        </div>
        <AeToolPrice
          price={model.totalPrice}
          {...(model.priceValidUntil === undefined ? {} : { validUntil: model.priceValidUntil })}
          size="sm"
          label="Indicative price"
          className="shrink-0 place-items-end"
        />
      </header>
      <div className="arc-decision-body">
        <AeToolFacts tool={tool} model={model} variant="compact" />
      </div>
      <div className="arc-decision-actions">
        {model.nextAction.kind === 'navigate' && model.nextAction.href !== undefined ? (
          <Link
            to={model.nextAction.href}
            onClick={onNavigate}
            className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.sm} min-h-touch w-fit`}
          >
            {model.nextAction.label}
          </Link>
        ) : code !== undefined ? (
          <AeCopyValue key={code} value={code} label={`Copy ${model.nextAction.label}`} className="min-h-touch w-fit" />
        ) : null}
      </div>
    </DecisionPanel>
  )
}

function decisionVariant(model: ToolInspectorModel): 'success' | 'warning' | 'outline' {
  if (model.nextAction.label === 'request for Agent') return 'success'
  if (model.availabilityPosture === 'setup_required') {
    return 'warning'
  }
  return 'outline'
}
