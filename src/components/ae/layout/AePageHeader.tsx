import { useId, type ReactNode } from 'react'
import { Heading, Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/Stack'

type AePageHeaderDensity = 'public' | 'operator'

type AePageHeaderProps = {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
  density?: AePageHeaderDensity
}

const containerClassByDensity: Record<AePageHeaderDensity, string> = {
  public: 'mx-auto w-full max-w-6xl px-4 py-12 md:px-6 md:py-16',
  operator: 'mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8',
}

export function AePageHeader({ eyebrow, title, description, actions, density = 'public' }: AePageHeaderProps) {
  const titleId = useId()
  const descriptionId = useId()
  const isPublic = density === 'public'

  return (
    <section aria-labelledby={titleId} aria-describedby={descriptionId} className={containerClassByDensity[density]}>
      <VStack gap={isPublic ? 6 : 3}>
        <div className="grid max-w-4xl gap-2">
          {eyebrow ? (
            <Text type="supporting" weight="medium" color="secondary" display="block">
              {eyebrow}
            </Text>
          ) : null}
          <Heading id={titleId} level={1} {...(isPublic ? { type: 'display-2' as const } : {})} textWrap="balance">
            {title}
          </Heading>
          <Text id={descriptionId} type={isPublic ? 'large' : 'body'} color="secondary" display="block" textWrap="pretty">
            {description}
          </Text>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </VStack>
    </section>
  )
}
