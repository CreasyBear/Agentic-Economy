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
    <section>
      <Card className="ae-form-section-card">
        <CardHeader>
          <CardTitle id={titleId}>{title}</CardTitle>
          <CardDescription id={descriptionId}>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </section>
  )
}
