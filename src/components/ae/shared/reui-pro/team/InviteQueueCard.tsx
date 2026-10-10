/** Licensed REUI Solution Users 4: https://reui.io/preview/base/solution-users-4
 * invite-queue-card.tsx SHA-256 31455d9d420e1d9d73db34721d7ac6969803555e393a5910f8bc0abd8e955fde
 * Upstream card composition; semantic heading and mobile action wrapping adapted.
 */
import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card"

interface InviteQueueCardProps {
  title: string
  description: ReactNode
  action?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  contentClassName?: string
  footerClassName?: string
}

export function InviteQueueCard({
  title,
  description,
  action,
  children,
  footer,
  className,
  contentClassName,
  footerClassName,
}: InviteQueueCardProps) {
  return (
    <Card className={cn("min-w-0 w-full gap-0 p-0", className)}>
      {/* Header */}
      <CardHeader className="items-center gap-1 border-b px-5 py-4 max-sm:has-data-[slot=card-action]:grid-cols-1">
        <h2 className="text-lg font-medium tracking-tight">{title}</h2>
        <CardDescription className="text-xs">{description}</CardDescription>
        {action ? (
          <CardAction className="self-center max-sm:col-start-1 max-sm:row-start-3 max-sm:justify-self-start max-sm:pt-3">{action}</CardAction>
        ) : null}
      </CardHeader>

      {/* Content */}
      <CardContent className={cn("min-w-0 p-0", contentClassName)}>
        {children}
      </CardContent>

      {footer ? (
        <CardFooter className={cn("border-t px-5 py-3", footerClassName)}>
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  )
}
