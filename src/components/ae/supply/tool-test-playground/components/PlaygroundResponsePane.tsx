import { CheckIcon, CopyIcon } from 'lucide-react'

import { Button } from '@/components/arc/button/button'

import type { PlaygroundResponsePaneProps } from '../tool-test-playground.contracts'

export function PlaygroundResponsePane({ response, hasCopied, onCopy }: PlaygroundResponsePaneProps) {
  return (
    <div className="grid min-h-[12rem] gap-1.5 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>Response Payload</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1"
          onClick={() => {
            void onCopy()
          }}
          disabled={!response || response.data === undefined}
          aria-label={hasCopied ? 'Response copied' : 'Copy response'}
        >
          {hasCopied ? (
            <CheckIcon className="size-3 text-success" />
          ) : (
            <CopyIcon className="size-3" />
          )}
          <span>{hasCopied ? 'Copied!' : 'Copy response'}</span>
        </Button>
      </div>
      {response ? (
        <pre className="max-h-60 overflow-auto font-mono text-xs leading-snug">
          {response.error !== undefined && response.data === undefined ? (
            <code className="text-destructive">{response.error}</code>
          ) : (
            <code>{JSON.stringify(response.data, null, 2)}</code>
          )}
        </pre>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Response will appear here after you send a test invocation.
        </div>
      )}
    </div>
  )
}
