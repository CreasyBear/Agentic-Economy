import { Link } from '@tanstack/react-router'
import { SearchIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { neutralizeBidiFormattingControls } from '@/modules/answer/public'

import { REVEAL_ENTER } from './AeGenerativeAnswerCopy'

export function RecoveryPrompts({
  title,
  prompts,
  links = [],
}: {
  title?: string
  prompts: readonly { label: string; query: string }[]
  links?: readonly { label: string; href: '/for-providers' }[]
}) {
  if (prompts.length === 0 && links.length === 0) {
    return null
  }
  const titleText = title === undefined ? 'Try a different request' : neutralizeBidiFormattingControls(title)

  return (
    <section
      className={cn(REVEAL_ENTER, 'grid gap-3 rounded-md border border-border bg-card p-3')}
      aria-label={titleText}
    >
      <header className="flex items-center gap-2">
        <span
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground"
          aria-hidden="true"
        >
          <SearchIcon className="size-4" />
        </span>
        <div className="grid gap-0.5">
          <p className="block text-sm font-medium text-muted-foreground">Try another way</p>
          <p dir="auto" style={{ unicodeBidi: 'isolate' }} className="text-sm font-semibold text-foreground">{titleText}</p>
        </div>
      </header>
      {prompts.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {prompts.map((prompt) => {
            const promptLabel = neutralizeBidiFormattingControls(prompt.label)
            return (
              <li key={`${prompt.label}-${prompt.query}`}>
                <Link
                  className="inline-flex min-h-9 items-center rounded-md border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-muted"
                  to="/"
                  search={{ q: prompt.query }}
                  dir="auto"
                  style={{ unicodeBidi: 'isolate' }}
                >
                  {promptLabel}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
      {links.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground" aria-label="More ways to continue">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                className="underline-offset-4 hover:text-foreground hover:underline"
                to="/for-providers"
                dir="auto"
                style={{ unicodeBidi: 'isolate' }}
              >
                {neutralizeBidiFormattingControls(link.label)}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
