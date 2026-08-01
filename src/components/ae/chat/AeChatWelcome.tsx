import { cn } from '@/lib/utils'
import { DIALOG_WELCOME } from '@/content/brand-copy'

const ENTER = 'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-base motion-safe:ease-emphasized'

export function AeChatWelcome() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
      <h1 id="ae-home-heading" className={cn('text-3xl font-semibold tracking-tight text-balance sm:text-4xl', ENTER)}>
        {DIALOG_WELCOME.heading}
      </h1>
      <p className={cn('block max-w-xl text-lg text-pretty text-muted-foreground', ENTER, 'motion-safe:delay-75')}>
        {DIALOG_WELCOME.subhead}
      </p>
    </div>
  )
}
