import type { ComponentPropsWithoutRef } from 'react'
import { Text } from '@astryxdesign/core/Text'

export type AeKickerProps = Omit<ComponentPropsWithoutRef<'p'>, 'color'> & {
  marker?: boolean
}

export function AeKicker({ children, className, marker: _marker = false, ...props }: AeKickerProps) {
  return (
    <Text as="p" type="supporting" weight="medium" color="secondary" display="block" className={className} {...props}>
      {children}
    </Text>
  )
}
