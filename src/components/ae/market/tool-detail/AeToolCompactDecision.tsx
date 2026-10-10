import { Link } from '@tanstack/react-router'
import { AeToolPrice } from '@/components/ae/market/AeToolPrice'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import type { AeStatus } from '@/lib/ui/status-presentation'
import { AeCopyValue } from '@/components/ae/shared/copy-value/AeCopyValue'
import { DecisionPanel } from '@/components/ae/shared/arc-pro/chat/DecisionPanel'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'

import { AeToolFacts } from './AeToolFacts'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
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
            <AeStatusBadge status={decisionStatus(model)} density="cell" />
            <span className="ml-2 text-sm font-normal text-muted-foreground">{model.decisionLabel}</span>
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
            className={`${actionLinkClassName('primary', 'sm')} min-h-touch w-fit`}
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

function decisionStatus(model: ToolInspectorModel): AeStatus {
  if (model.nextAction.label === 'request for Agent') return 'ready_now'
  if (model.availabilityPosture === 'setup_required') return 'setup_required'
  return 'not_live'
}
