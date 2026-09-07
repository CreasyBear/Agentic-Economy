import { Link } from '@tanstack/react-router'

import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
          <Button asChild variant="secondary" className="min-h-touch w-full">
            <Link to={nextAction.href}>{nextAction.label}</Link>
          </Button>
        ) : code !== undefined ? (
          <AeCopyCommand
            comfortable
            label={nextAction.label}
            code={code}
            className="[&_code]:text-foreground"
          />
        ) : null}

        <p className="text-xs leading-5 text-background/55">
          Your agent confirms exact price, authority, balance, and availability through tool.quote before it can call.
        </p>
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
      <CardContent>
        {nextAction.kind === 'navigate' && nextAction.href !== undefined ? (
          <Button
            asChild
            size="sm"
            className="min-h-touch"
          >
            <Link to={nextAction.href}>{nextAction.label}</Link>
          </Button>
        ) : code !== undefined ? (
          <AeCopyCommand
            compact
            label={nextAction.label}
            code={code}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

function TicketFact({
  label,
  value,
  mono = false,
  className,
}: Readonly<{ label: string; value: string; mono?: boolean; className?: string }>) {
  return (
    <div className={cn('grid min-w-0 gap-1 py-3', className)}>
      <dt className="text-xs font-medium text-background/55">
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
