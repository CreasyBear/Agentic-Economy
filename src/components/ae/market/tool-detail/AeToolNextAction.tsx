import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
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
        className="grid min-w-0 content-start gap-related border-t border-border px-gutter py-section"
      >
        <h2
          id={titleId}
          className="text-pretty text-lg font-medium leading-snug tracking-tight text-foreground"
        >
          {nextActionTitle(model)}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {model.nextActionDescription}
        </p>

        {nextAction.kind === 'navigate' ? (
          <a
            href={nextAction.href ?? agentSetupHref(model.toolRef)}
            className={cn(actionLinkClassName('primary', 'md'), 'min-h-touch w-full sm:w-auto sm:justify-self-start')}
          >
            {nextAction.label === 'Find Tool alternatives' ? 'Find Tool alternatives' : 'Connect an Agent'}
          </a>
        ) : code !== undefined ? (
          <AeCopyCommand
            comfortable
            prompt={false}
            label="Continue with your Agent"
            code={code}
          />
        ) : null}

        {nextAction.label === 'request for Agent' ? (
          <a
            href={agentSetupHref(model.toolRef)}
            className={cn(actionLinkClassName('ghost', 'md'), 'underline underline-offset-4', 'min-h-touch w-full sm:w-auto sm:justify-self-start')}
          >
            Need to connect an Agent?
          </a>
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
        {nextAction.kind === 'navigate' ? (
          <a
            href={nextAction.href ?? agentSetupHref(model.toolRef)}
            className={cn(actionLinkClassName('primary', 'sm'), 'min-h-touch')}
          >
            {nextAction.label === 'Find Tool alternatives' ? 'Find Tool alternatives' : 'Connect an Agent'}
          </a>
        ) : code !== undefined ? (
          <AeCopyCommand
            compact
            prompt={false}
            label="Continue with your Agent"
            code={code}
          />
        ) : null}
        {nextAction.label === 'request for Agent' ? (
          <a
            href={agentSetupHref(model.toolRef)}
            className={cn(actionLinkClassName('ghost', 'sm'), 'underline underline-offset-4', 'min-h-touch')}
          >
            Need to connect an Agent?
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
  if (model.nextAction.label === 'request for Agent') return 'Use this Tool in your agent'
  return 'Find an operational alternative'
}
