/* Arc page-header title/intro/actions adapted for operator chrome.
 * The caller retains the title, description, sticky state and real action nodes. */
import { useId, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import './PageHeaderComposition.css'

type AeRecordHeaderProps = {
  title: string
  description?: string
  icon?: ReactNode
  actions?: ReactNode
  className?: string
  sticky?: boolean
}

/**
 * Compact operator page bar: title, visible description, trailing actions.
 */
export function AeRecordHeader({
  title,
  description,
  icon,
  actions,
  className,
  sticky = false,
}: AeRecordHeaderProps) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <div
      className={cn(
        'arc-market arc-record-header',
        className,
      )}
      data-record-header-sticky={sticky ? 'true' : undefined}
      {...(description === undefined ? {} : { 'aria-describedby': descriptionId })}
    >
      <div className="arc-record-header-intro">
        {icon === undefined ? null : (
          <span
            aria-hidden="true"
            className="arc-record-header-icon"
          >
            {icon}
          </span>
        )}
        <div className="arc-page-header-intro">
          <h1 id={titleId} title={title} className="arc-page-header-title">
            {title}
          </h1>
          {description === undefined ? null : (
            <p id={descriptionId} className="arc-page-header-description">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions === undefined ? null : (
        <div className="arc-page-header-actions">{actions}</div>
      )}
    </div>
  )
}
