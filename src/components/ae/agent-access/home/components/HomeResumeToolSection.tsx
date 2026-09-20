import { Link } from '@tanstack/react-router'

import { AeSection } from '@/components/ae/layout/AeSection'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

import type { HomeResumeToolSectionProps } from '../agent-access-home.contracts'

export function HomeResumeToolSection({
  title,
  description,
  resumeTool,
  showReturnLink,
}: HomeResumeToolSectionProps) {
  return (
    <AeSection
      title={title}
      description={description}
      className="rounded-xl border border-border bg-card p-gutter shadow-soft"
    >
      {showReturnLink ? (
        <Link
          to="/tools/$toolRef"
          params={{ toolRef: resumeTool }}
          className={cn(buttonVariants(), 'w-fit min-h-touch')}
        >
          Return to selected Tool
        </Link>
      ) : null}
    </AeSection>
  )
}
