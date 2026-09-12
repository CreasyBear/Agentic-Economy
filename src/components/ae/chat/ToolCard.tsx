import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeToolPrice } from '@/components/ae/market/AeToolPrice'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Marker, MarkerContent } from '@/components/ui/marker'
import { Skeleton } from '@/components/ui/skeleton'
import {
  chatBrowseMarket,
  chatChoiceLinkName,
  chatShowingTools,
  chatToolStatus,
  chatViewTool,
} from '@/lib/public/chat-ia'
import {
  toolCardState,
  type ToolCardProjection,
  type ToolChoiceRow,
} from '@/modules/chat/tool-card'

const READINESS_VARIANT = {
  'Ready now': 'success',
  'Setup required': 'warning',
  Unavailable: 'outline',
} as const

function inspectHref(toolRef: string): string {
  return `/tools/${encodeURIComponent(toolRef)}`
}

function choiceInitial(title: string): string {
  return title.trim().charAt(0).toUpperCase() || 'T'
}

function readinessVariant(readiness: string | undefined): 'success' | 'warning' | 'outline' | undefined {
  if (readiness === 'Ready now') return READINESS_VARIANT['Ready now']
  if (readiness === 'Setup required') return READINESS_VARIANT['Setup required']
  if (readiness === 'Unavailable') return READINESS_VARIANT.Unavailable
  return undefined
}

function ChoiceRow({ choice }: { choice: ToolChoiceRow }) {
  const badgeVariant = readinessVariant(choice.readiness)
  return (
    <Item asChild variant="muted" size="sm">
      <a href={inspectHref(choice.toolRef)} aria-label={chatChoiceLinkName(choice.title, choice.readiness)}>
        <ItemMedia variant="icon" aria-hidden="true" className="font-mono text-xs font-semibold">
          {choiceInitial(choice.title)}
        </ItemMedia>
        <ItemContent>
          <ItemHeader>
            <ItemTitle>{choice.title}</ItemTitle>
            {choice.readiness === undefined || badgeVariant === undefined ? null : (
              <Badge variant={badgeVariant}>{choice.readiness}</Badge>
            )}
          </ItemHeader>
          {choice.provider === undefined ? null : (
            <ItemDescription>{choice.provider}</ItemDescription>
          )}
          {choice.access === undefined ? null : (
            <ItemFooter className="text-muted-foreground">{choice.access}</ItemFooter>
          )}
        </ItemContent>
        {choice.price === undefined ? null : (
          <AeToolPrice price={choice.price} {...(choice.priceValidUntil === undefined ? {} : { validUntil: choice.priceValidUntil })} size="sm" className="basis-full sm:ms-auto sm:basis-auto" />
        )}
      </a>
    </Item>
  )
}

function ChoiceList({ choices }: { choices: readonly ToolChoiceRow[] }) {
  return (
    <ItemGroup className="gap-intra" aria-label="Tools">
      {choices.map((choice) => (
        <ChoiceRow key={choice.toolRef} choice={choice} />
      ))}
    </ItemGroup>
  )
}

function ChoiceRemainder({ count, shown }: { count: number; shown: number }) {
  const remainder = count > shown && shown > 0
  return (
    <Marker>
      <MarkerContent>
        {chatShowingTools(shown, count)}
        {remainder ? (
          <>
            {' '}
            <a href="/market">{chatBrowseMarket}</a>
          </>
        ) : null}
      </MarkerContent>
    </Marker>
  )
}

function CardBody({ projection }: { projection: ToolCardProjection }) {
  switch (projection.kind) {
    case 'working':
      return <Skeleton className="h-4 w-1/3" />
    case 'status':
      return (
        <Alert variant={projection.state === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{projection.summary}</AlertDescription>
        </Alert>
      )
    case 'choices':
      return (
        <div className="grid gap-related">
          {projection.choices.length === 0 ? null : <ChoiceList choices={projection.choices} />}
          {projection.contrasts === undefined || projection.contrasts.length === 0
            ? null
            : <AeFactList density="compact" facts={projection.contrasts} />}
        </div>
      )
    case 'inspect':
      return projection.facts.length === 0
        ? null
        : <AeFactList density="compact" facts={projection.facts} />
    case 'execute': {
      const toolRef = projection.toolRefs[0]
      return (
        <div className="grid gap-related">
          <Alert variant={projection.state === 'reconciliation_required' ? 'destructive' : 'default'}>
            <AlertTitle>{executeStateTitle(projection.state)}</AlertTitle>
            <AlertDescription>{projection.summary}</AlertDescription>
          </Alert>
          {projection.name === undefined || toolRef === undefined ? null : (
            <Item asChild variant="muted" size="sm">
              <a href={inspectHref(toolRef)} aria-label={chatViewTool(projection.name)}>
                <ItemMedia variant="icon" aria-hidden="true" className="font-mono text-xs font-semibold">
                  {choiceInitial(projection.name)}
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{projection.name}</ItemTitle>
                </ItemContent>
              </a>
            </Item>
          )}
          {projection.outputPreview === undefined ? null : (
            <section className="grid min-w-0 gap-intra" aria-label="Call result">
              <h4 className="text-sm font-semibold text-foreground">Returned output</h4>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/35 p-3 font-mono text-xs leading-5 text-foreground">
                {projection.outputPreview}
              </pre>
              {projection.outputTruncated === true ? (
                <p className="text-xs text-muted-foreground">Preview truncated. Open the call receipt for the canonical result.</p>
              ) : null}
            </section>
          )}
          {projection.facts.length === 0 ? null : (
            <AeFactList density="compact" facts={projection.facts} />
          )}
          {projection.callRef === undefined ? null : (
            <AeFactList density="compact" facts={[{
              label: 'Call reference',
              value: <AeCopyReference label="call reference" value={projection.callRef} />,
            }]} />
          )}
          {projection.receiptRef === undefined ? null : (
            <AeFactList density="compact" facts={[{
              label: 'Receipt reference',
              value: <AeCopyReference label="receipt reference" value={projection.receiptRef} />,
            }]} />
          )}
          {projection.evidenceHash === undefined ? null : (
            <details className="group border-t border-border pt-intra">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Evidence</summary>
              <AeCopyReference label="evidence hash" value={projection.evidenceHash} className="mt-intra" />
            </details>
          )}
          {projection.nextAction === undefined ? null : (
            <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Next:</span> {projection.nextAction}</p>
          )}
        </div>
      )
    }
    default: {
      const exhaustive: never = projection
      return exhaustive
    }
  }
}

function executeStateTitle(state: Extract<ToolCardProjection, { kind: 'execute' }>['state']): string {
  if (state === 'completed') return 'Result ready'
  if (state === 'pending') return 'Call pending'
  if (state === 'needs_authority') return 'Approval required'
  if (state === 'reconciliation_required') return 'Reconciliation required'
  return 'Call refused'
}

function ExecuteNextAction({ projection }: Readonly<{
  projection: Extract<ToolCardProjection, { kind: 'execute' }>
}>) {
  const suggestedNextAction = projection.suggestedNextAction
  if (suggestedNextAction === undefined) return null
  if (suggestedNextAction.href !== undefined) {
    return (
      <Button asChild variant="outline" size="sm">
        <a href={suggestedNextAction.href}>{suggestedNextAction.label}</a>
      </Button>
    )
  }
  return suggestedNextAction.command === undefined
    ? null
    : <AeCopyCommand compact label={suggestedNextAction.label} code={suggestedNextAction.command} />
}

const STATUS_VARIANT = {
  complete: 'success',
  working: 'info',
  pending: 'info',
  attention: 'warning',
  refused: 'warning',
  error: 'destructive',
} as const

export function ToolCard({ projection }: { projection: ToolCardProjection }) {
  const state = toolCardState(projection)
  return (
      <Card data-tool-card={projection.toolId}>
      <CardHeader>
        <CardTitle>
          <h3 className="m-0">{projection.title}</h3>
        </CardTitle>
        <CardAction>
          <Badge variant={STATUS_VARIANT[state]}>{chatToolStatus[state]}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <CardBody projection={projection} />
      </CardContent>
      {projection.kind === 'choices' && projection.count !== undefined ? (
        <CardFooter>
          <ChoiceRemainder count={projection.count} shown={projection.choices.length} />
        </CardFooter>
      ) : projection.kind === 'execute' && projection.suggestedNextAction !== undefined ? (
        <CardFooter>
          <ExecuteNextAction projection={projection} />
        </CardFooter>
      ) : null}
    </Card>
  )
}
