import { Link } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  BotIcon,
  CheckCircle2Icon,
  ClockIcon,
  MapPinIcon,
  MessageSquareIcon,
  SearchIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/sources'

type PreviewSource = {
  name: string
  detail: string
}

const previewSources: readonly PreviewSource[] = [
  { name: 'Northside Hot Water', detail: 'Preston + nearby suburbs' },
  { name: 'Metro Service Co.', detail: 'Publishes first-contact instructions' },
  { name: 'AquaFix Local', detail: 'Details supplied by business' },
]

const nextSteps = [
  { icon: SearchIcon, label: 'Compare published details' },
  { icon: MessageSquareIcon, label: 'Send a qualified inquiry' },
  { icon: ClockIcon, label: 'Confirm timing with the business' },
] as const

const promptSuggestions = [
  'after-hours plumber near Preston',
  'locksmith for shopfront today',
  'electrician with fast reply cue',
] as const

export function AeAssistantAnswerPreview() {
  return (
    <Card className="ae-assistant-answer-preview border-[var(--ae-public-line-strong)] bg-[var(--ae-surface-raised)]">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BotIcon className="size-4 text-[var(--ae-amber)]" aria-hidden="true" />
              Ask, compare, hand off
            </CardTitle>
            <CardDescription>
              <Shimmer as="span" duration={3}>A preview of the answer shape AE is built for.</Shimmer>
            </CardDescription>
          </div>
          <Badge variant="outline">Assistant-readable</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <Suggestions wrap aria-label="Example AE questions">
          {promptSuggestions.map((suggestion) => (
            <Suggestion
              key={suggestion}
              asChild
              className="rounded-[var(--ae-radius-sm)]"
              suggestion={suggestion}
              variant="outline"
            >
              <Link to="/" search={{ q: suggestion }}>{suggestion}</Link>
            </Suggestion>
          ))}
        </Suggestions>

        <div className="grid gap-3">
          <Message from="user">
            <MessageContent>
              Need hot water help near Preston today.
            </MessageContent>
          </Message>

          <Message from="assistant">
            <MessageContent>
              <MessageResponse>
                3 listed businesses publish service details for this job. Compare area, response cue, and next step before contacting one.
              </MessageResponse>
            </MessageContent>
          </Message>
        </div>

        <Sources defaultOpen aria-label="Published business details used in the preview">
          <SourcesTrigger count={previewSources.length} />
          <SourcesContent>
            {previewSources.map((source) => (
              <Source key={source.name} href="/registry" title={source.name}>
                <MapPinIcon data-icon="inline-start" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="font-medium text-foreground">{source.name}</span>
                  <span className="text-muted-foreground"> · {source.detail}</span>
                </span>
              </Source>
            ))}
          </SourcesContent>
        </Sources>

        <div className="grid gap-2 md:grid-cols-3">
          {nextSteps.map(({ icon: Icon, label }) => (
            <div key={label} className="flex min-h-11 items-center gap-2 rounded-[var(--ae-radius-sm)] border border-[var(--ae-public-line)] bg-[var(--ae-surface-sunken)] px-3 text-sm">
              <Icon className="size-4 shrink-0 text-[var(--ae-amber)]" aria-hidden="true" />
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--ae-public-line)] pt-4 md:flex-row md:items-center md:justify-between">
          <Marker>
            <MarkerIcon>
              <CheckCircle2Icon aria-hidden="true" />
            </MarkerIcon>
            <MarkerContent>AE routes to the next step. The business still confirms the job.</MarkerContent>
          </Marker>
          <Button asChild>
            <Link to="/" search={{ q: 'hot water help near Preston today' }}>
              Try the question
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
