import { Link } from '@tanstack/react-router'

import { AeSection } from '@/components/ae/layout/AeSection'
import arcButton from '@/components/arc/button/button.module.css'

import type { HomeResumeToolSectionProps } from '../agent-access-home.contracts'
import '../AgentHomeComposition.css'

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
      className="arc-agent-resume-section"
    >
      {showReturnLink ? (
        <Link
          to="/tools/$toolRef"
          params={{ toolRef: resumeTool }}
          className={`${arcButton.button} ${arcButton.primary} ${arcButton.md} arc-agent-inline-action`}
        >
          Return to selected Tool
        </Link>
      ) : null}
    </AeSection>
  )
}
