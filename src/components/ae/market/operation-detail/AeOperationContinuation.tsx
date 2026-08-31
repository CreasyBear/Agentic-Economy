import { Link } from '@tanstack/react-router'

import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

import {
  continuationCode,
  type OperationInspectorModel,
} from './operation-inspector-model'

export function AeOperationContinuation({
  model,
  variant,
}: Readonly<{
  model: OperationInspectorModel
  variant: 'compact' | 'full'
}>) {
  const { continuation } = model
  const titleId = `operation-continuation-${variant}`
  const code = continuationCode(model)

  return (
    <Card
      role={variant === 'full' ? 'complementary' : 'region'}
      aria-labelledby={titleId}
      className={cn(variant === 'full' && 'lg:sticky lg:top-20')}
    >
      <CardHeader>
        <CardTitle>
          {variant === 'full' ? (
            <h2 id={titleId}>What you can do next</h2>
          ) : (
            <h3 id={titleId}>What you can do next</h3>
          )}
        </CardTitle>
        <CardDescription>{model.continuationDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {continuation.kind === 'navigate' && continuation.href !== undefined ? (
          <Button
            asChild
            size={variant === 'compact' ? 'sm' : 'default'}
            className={cn('min-h-touch', variant === 'full' && 'w-full')}
          >
            <Link to={continuation.href}>{continuation.label}</Link>
          </Button>
        ) : code !== undefined ? (
          <AeCopyCommand
            compact={variant === 'compact'}
            label={continuation.label}
            code={code}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}
