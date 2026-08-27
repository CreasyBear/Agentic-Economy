import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeOperationPrice } from '@/components/ae/market/AeOperationPrice'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
  chatShowingOperations,
  chatToolStatus,
  chatViewOperation,
} from '@/lib/public/chat-ia'
import {
  operationCardState,
  type OperationCardProjection,
  type OperationChoiceRow,
} from '@/modules/chat/tool-card'

const READINESS_VARIANT = {
  'Ready now': 'success',
  'Integration available': 'warning',
  Unavailable: 'outline',
} as const

function inspectHref(operationRef: string): string {
  return `/operations/${encodeURIComponent(operationRef)}`
}

function choiceInitial(title: string): string {
  return title.trim().charAt(0).toUpperCase() || 'O'
}

function readinessVariant(readiness: string | undefined): 'success' | 'warning' | 'outline' | undefined {
  if (readiness === 'Ready now') return READINESS_VARIANT['Ready now']
  if (readiness === 'Integration available') return READINESS_VARIANT['Integration available']
  if (readiness === 'Unavailable') return READINESS_VARIANT.Unavailable
  return undefined
}

function ChoiceRow({ choice }: { choice: OperationChoiceRow }) {
  const badgeVariant = readinessVariant(choice.readiness)
  return (
    <Item asChild variant="muted" size="sm">
      <a href={inspectHref(choice.operationRef)} aria-label={chatChoiceLinkName(choice.title, choice.readiness)}>
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
          {choice.supplier === undefined ? null : (
            <ItemDescription>{choice.supplier}</ItemDescription>
          )}
          {choice.access === undefined ? null : (
            <ItemFooter className="text-muted-foreground">{choice.access}</ItemFooter>
          )}
        </ItemContent>
        {choice.price === undefined ? null : (
          <AeOperationPrice price={choice.price} size="sm" className="basis-full sm:ms-auto sm:basis-auto" />
        )}
      </a>
    </Item>
  )
}

function ChoiceList({ choices }: { choices: readonly OperationChoiceRow[] }) {
  return (
    <ItemGroup className="gap-intra" aria-label="Tools">
      {choices.map((choice) => (
        <ChoiceRow key={choice.operationRef} choice={choice} />
      ))}
    </ItemGroup>
  )
}

function ChoiceRemainder({ count, shown }: { count: number; shown: number }) {
  const remainder = count > shown && shown > 0
  return (
    <Marker>
      <MarkerContent>
        {chatShowingOperations(shown, count)}
        {remainder ? (
          <>
            {' '}
            <a href="/market?window=30d">{chatBrowseMarket}</a>
          </>
        ) : null}
      </MarkerContent>
    </Marker>
  )
}

function CardBody({ projection }: { projection: OperationCardProjection }) {
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
      const operationRef = projection.operationRefs[0]
      if (projection.name === undefined) return null
      if (operationRef === undefined) {
        return (
          <Item variant="muted" size="sm">
            <ItemContent>
              <ItemTitle>{projection.name}</ItemTitle>
            </ItemContent>
          </Item>
        )
      }
      return (
        <Item asChild variant="muted" size="sm">
          <a href={inspectHref(operationRef)} aria-label={chatViewOperation(projection.name)}>
            <ItemMedia variant="icon" aria-hidden="true" className="font-mono text-xs font-semibold">
              {choiceInitial(projection.name)}
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{projection.name}</ItemTitle>
            </ItemContent>
          </a>
        </Item>
      )
    }
    default: {
      const exhaustive: never = projection
      return exhaustive
    }
  }
}

const STATUS_VARIANT = {
  complete: 'success',
  working: 'info',
  refused: 'warning',
  error: 'destructive',
} as const

export function OperationCard({ projection }: { projection: OperationCardProjection }) {
  const state = operationCardState(projection)
  return (
    <Card data-operation-tool={projection.toolId}>
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
      ) : null}
    </Card>
  )
}
