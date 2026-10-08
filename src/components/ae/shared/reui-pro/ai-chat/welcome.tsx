/* ReUI ai-chat-3 welcome.tsx: scrollable welcome and outlined Start rows.
 * Registry SHA-256: c64800b8fc671b83430ffd8a9475f1efd14fce54c13394597d2547236227b11d.
 * AE owns copy and starter admission; saved history stays in its existing owner.
 */
import { CornerDownLeftIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export function ReuiChatWelcome({ children }: Readonly<{ children: ReactNode }>) {
  return <div data-chat-welcome className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain scroll-py-2 px-4 py-6 sm:px-6">
    <div className="m-auto flex w-full max-w-3xl flex-col gap-8">{children}</div>
  </div>
}

export function ReuiChatStarters({ suggestions, onPick }: Readonly<{
  suggestions: readonly Readonly<{ title: string; label: string; prompt: string }>[]
  onPick(prompt: string): void
}>) {
  return <ul data-testid="suggested-actions" aria-label="Suggested requests" className="mx-auto flex w-full max-w-lg flex-col gap-2">
    {suggestions.map(suggestion => <li key={suggestion.prompt}>
      <Button type="button" variant="outline" aria-label={suggestion.prompt} onClick={() => onPick(suggestion.prompt)}
        className="h-auto w-full justify-start gap-3 border-border px-4 py-3 text-start font-normal whitespace-normal">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm">{suggestion.title}</span>
          <span className="text-xs text-muted-foreground">{suggestion.label}</span>
        </span>
        <CornerDownLeftIcon className="text-muted-foreground" aria-hidden="true" />
      </Button>
    </li>)}
  </ul>
}
