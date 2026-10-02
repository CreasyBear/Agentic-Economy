/* Arc settings-page pane/group composition for existing section callers.
 * Requires caller-owned facts and actions; ensures the same heading/anchor/ref
 * contract. No state, commands or recovery are owned by this layout. */
import { useId, type ReactNode, type Ref } from 'react'

import { cn } from '@/lib/utils'
import './SectionComposition.css'

type AeSectionProps = {
  title: string
  description?: string
  children?: ReactNode
  id?: string
  className?: string
  headingRef?: Ref<HTMLHeadingElement>
}

export function AeSection({ title, description, children, id, className, headingRef }: AeSectionProps) {
  const generatedTitleId = useId()
  const titleId = `${generatedTitleId}-title`
  const descriptionId = `${generatedTitleId}-description`

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={description === undefined ? undefined : descriptionId}
      className={cn('arc-market arc-section', className)}
      {...(id === undefined ? {} : { id })}
    >
      <header className="arc-section-header">
        <h2
          ref={headingRef}
          id={titleId}
          tabIndex={headingRef === undefined ? undefined : -1}
          className="arc-section-title"
        >
          {title}
        </h2>
        {description === undefined ? null : (
          <p id={descriptionId} className="arc-section-description">{description}</p>
        )}
      </header>
      {children}
    </section>
  )
}

export function AeSettingsStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('arc-market arc-settings-stack', className)}>{children}</div>
}
