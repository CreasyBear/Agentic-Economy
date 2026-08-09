import { Link } from '@tanstack/react-router'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { neutralizeBidiFormattingControls } from '@/modules/answer/public'
import type { PublicThreadProjection } from '@/modules/answer-thread/public'
import { AeThreadScroller } from './AeThreadScroller'
import { AeThreadTranscript } from './AeThreadTranscript'

export type AeSharedThreadViewProps = {
  projection: PublicThreadProjection | null
}

export function AeSharedThreadView({ projection }: AeSharedThreadViewProps) {
  const displayTitle = projection === null ? '' : neutralizeBidiFormattingControls(projection.title)
  return (
    <AePublicShell immersive>
      <div className="flex h-full min-h-0 w-full flex-col bg-background">
        <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between gap-3 border-b border-border bg-background px-4 py-2 md:px-6">
          <Link to="/" className="inline-flex min-h-11 items-center rounded-sm font-heading text-sm font-semibold text-foreground no-underline hover:text-brand">
            Agentic Economy
          </Link>
          <Button asChild variant="secondary" size="sm" className="min-h-11">
            <a href="/t/new">Ask your own question</a>
          </Button>
        </header>
        {projection === null ? (
          <div className="mx-auto my-12 w-full max-w-[36rem] px-4 md:px-6">
            <Empty className="border border-border bg-card p-5">
              <EmptyHeader>
                <h1 className="text-lg font-medium tracking-tight">Shared answer unavailable</h1>
                <EmptyDescription>This read-only link is invalid, revoked, or no longer available.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild variant="secondary" size="sm">
                  <a href="/t/new">Ask your own question</a>
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mx-auto w-full max-w-[56rem] px-4 pt-4 md:px-6">
              <p className="text-sm text-muted-foreground" role="note">Shared read-only answer</p>
              <h1 dir="auto" style={{ unicodeBidi: 'isolate' }} className="mt-1 truncate font-heading text-xl text-foreground">{displayTitle}</h1>
            </div>
            <AeThreadScroller defaultScrollPosition="end" aria-label="Shared answer transcript" showJumpButton={false}>
              <AeThreadTranscript threadId={projection.threadId} projection={projection} />
            </AeThreadScroller>
          </div>
        )}
      </div>
    </AePublicShell>
  )
}
