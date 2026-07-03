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
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'

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
    <Card padding={5} className="grid gap-5 border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1.5">
          <Text type="large" weight="semibold" color="primary" className="flex items-center gap-2">
            <BotIcon className="size-4 text-primary" aria-hidden="true" />
            Ask, compare, hand off
          </Text>
          <Text color="secondary" display="block">
            <Shimmer as="span" duration={3}>A preview of the answer shape AE is built for.</Shimmer>
          </Text>
        </div>
        <Badge variant="neutral" label="Assistant-readable" />
      </div>

      <Suggestions wrap aria-label="Example AE questions">
        {promptSuggestions.map((suggestion) => (
          <Suggestion
            key={suggestion}
            asChild
            className="rounded-sm"
            suggestion={suggestion}
            variant="secondary"
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
                <span className="font-medium text-primary">{source.name}</span>
                <span className="text-secondary"> · {source.detail}</span>
              </span>
            </Source>
          ))}
        </SourcesContent>
      </Sources>

      <div className="grid gap-2 md:grid-cols-3">
        {nextSteps.map(({ icon: Icon, label }) => (
          <div key={label} className="flex min-h-11 items-center gap-2 rounded-sm border bg-muted/40 px-3 text-sm">
            <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex min-h-4 w-full items-center gap-2 text-left text-sm text-secondary">
          <span aria-hidden="true" className="size-4 shrink-0">
            <CheckCircle2Icon aria-hidden="true" />
          </span>
          <span className="min-w-0 break-words">AE routes to the next step. The business still confirms the job.</span>
        </div>
        <Button
          label="Try the question"
          variant="primary"
          href={`/?q=${encodeURIComponent('hot water help near Preston today')}`}
          endContent={<ArrowRightIcon aria-hidden="true" />}
        />
      </div>
    </Card>
  )
}
