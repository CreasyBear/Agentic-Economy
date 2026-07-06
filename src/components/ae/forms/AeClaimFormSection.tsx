import { useId, type ReactNode } from 'react'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'

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
      <Card padding={5}>
        <div className="grid gap-2">
          <Text as="h2" type="large" weight="semibold" id={titleId}>
            {title}
          </Text>
          <Text as="p" type="supporting" id={descriptionId}>
            {description}
          </Text>
        </div>
        <div className="mt-5 grid gap-5">{children}</div>
      </Card>
    </section>
  )
}
