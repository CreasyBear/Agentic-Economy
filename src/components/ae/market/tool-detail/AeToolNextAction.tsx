import { Link } from '@tanstack/react-router'

import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
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
    const showHeading = nextAction.label !== 'Tool reference'

    return (
      <aside
        aria-label="What you can do next"
        className="grid min-w-0 content-start gap-related border-t border-border px-gutter py-section"
      >
        {showHeading ? (
          <h2
            id={titleId}
            className="text-pretty text-lg font-medium leading-snug tracking-tight text-foreground"
          >
            {nextActionTitle(model)}
          </h2>
        ) : null}
        <p className="text-sm leading-6 text-muted-foreground">
          {model.nextActionDescription}
        </p>

        {nextAction.kind === 'navigate' && nextAction.href !== undefined ? (
          <Link
            to={nextAction.href}
            className={cn(buttonVariants(), 'min-h-touch w-full sm:w-auto sm:justify-self-start')}
          >
            {nextAction.label}
          </Link>
        ) : code !== undefined ? (
          <AeCopyCommand
            comfortable
            label={nextAction.label}
            code={code}
          />
        ) : null}

        {nextAction.label === 'Tool reference' ? (
          <div className="grid gap-intra">
            <p className="text-xs leading-5 text-muted-foreground">
              Your agent confirms the exact buyer amount in AUD, authority, balance, and availability through tool.quote before it can Call.
            </p>
            <a
              href={agentSetupHref(model.toolRef)}
              className={cn(buttonVariants({ variant: 'outline' }), 'min-h-touch w-full sm:w-auto sm:justify-self-start')}
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

function nextActionTitle(model: ToolInspectorModel): string {
  if (model.nextAction.label === 'Tool reference') return 'Use this Tool in your agent'
  return 'Find an operational alternative'
}
