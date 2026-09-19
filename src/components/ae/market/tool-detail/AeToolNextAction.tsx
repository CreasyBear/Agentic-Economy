import { Link } from '@tanstack/react-router'

import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  nextActionCode,
  type ToolInspectorModel,
} from './tool-inspector-model'

export function AeToolNextAction({
  model,
  variant,
}: Readonly<{
  model: ToolInspectorModel
  variant: 'compact' | 'full'
}>) {
  const { nextAction } = model
  const titleId = `tool-next-action-${variant}`
  const code = nextActionCode(model)

  if (variant === 'full') {
    return (
      <aside
        aria-label="What you can do next"
        className="grid h-full min-w-0 content-start gap-5 bg-foreground px-gutter py-6 text-background"
      >
        <div className="grid min-w-0 gap-3">
          <Badge
            variant="outline"
            className="border-background/25 bg-background/10 text-background"
          >
            {model.readinessLabel}
          </Badge>
          <h2 id={titleId} className="text-balance font-sans text-2xl font-semibold leading-tight tracking-tight">
            {nextActionTitle(model)}
          </h2>
          <p className="text-sm leading-6 text-background/70">
            {model.nextActionDescription}
          </p>
        </div>

        <dl className="grid min-w-0 grid-cols-2 border-y border-background/20">
          <TicketFact label="Indicative price" value={model.totalPrice} mono className="border-e border-background/20" />
          <TicketFact label="Access" value={model.authenticationLabel} />
        </dl>

        {nextAction.kind === 'navigate' && nextAction.href !== undefined ? (
          <Link
            to={nextAction.href}
            className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch w-full')}
          >
            {nextAction.label}
          </Link>
        ) : code !== undefined ? (
          <AeCopyCommand
            comfortable
            label={nextAction.label}
            code={code}
            className="[&_code]:text-foreground"
          />
        ) : null}

        {nextAction.label === 'Tool reference' ? (
          <div className="grid gap-3">
            <p className="text-xs leading-5 text-background/75">
              Your agent confirms the exact buyer amount in AUD, authority, balance, and availability through tool.quote before it can Call.
            </p>
            <a
              href={agentSetupHref(model.toolRef)}
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'min-h-touch w-full border-background/30 bg-transparent text-background hover:bg-background/10 hover:text-background',
              )}
            >
              Connect an Agent first
            </a>
          </div>
        ) : null}
      </aside>
    )
  }

  return (
    <Card
      role="region"
      aria-labelledby={titleId}
    >
      <CardHeader>
        <CardTitle>
          <h3 id={titleId}>What you can do next</h3>
        </CardTitle>
        <CardDescription>{model.nextActionDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {nextAction.kind === 'navigate' && nextAction.href !== undefined ? (
          <Link
            to={nextAction.href}
            className={cn(buttonVariants({ size: 'sm' }), 'min-h-touch')}
          >
            {nextAction.label}
          </Link>
        ) : code !== undefined ? (
          <AeCopyCommand
            compact
            label={nextAction.label}
            code={code}
          />
        ) : null}
        {nextAction.label === 'Tool reference' ? (
          <a
            href={agentSetupHref(model.toolRef)}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'min-h-touch')}
          >
            Connect an Agent first
          </a>
        ) : null}
      </CardContent>
    </Card>
  )
}

function agentSetupHref(toolRef: string): string {
  return `/agent-access?resumeTool=${encodeURIComponent(toolRef)}`
}

function TicketFact({
  label,
  value,
  mono = false,
  className,
}: Readonly<{ label: string; value: string; mono?: boolean; className?: string }>) {
  return (
    <div className={cn('grid min-w-0 gap-1 py-3', className)}>
      <dt className="text-xs font-medium text-background/75">
        {label}
      </dt>
      <dd className={cn(
        'break-words text-sm font-semibold text-background',
        mono && 'font-mono tabular-nums',
      )}>
        {value}
      </dd>
    </div>
  )
}

function nextActionTitle(model: ToolInspectorModel): string {
  if (model.nextAction.label === 'Tool reference') return 'Use this Tool in your agent'
  return 'Find an operational alternative'
}
