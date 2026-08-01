import { useId, type ReactNode } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type AeClaimFormSectionProps = {
  title: string
  description: string
  children: ReactNode
}

export function AeClaimFormSection({ title, description, children }: AeClaimFormSectionProps) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <section aria-labelledby={titleId} aria-describedby={descriptionId}>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id={titleId} className="text-xl font-semibold text-foreground">{title}</h2>
          </CardTitle>
          <CardDescription>
            <p id={descriptionId}>{description}</p>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">{children}</CardContent>
      </Card>
    </section>
  )
}
