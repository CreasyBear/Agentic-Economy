import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import type { ComponentPropsWithoutRef, RefObject } from 'react'

export type TabsProps = Omit<ComponentPropsWithoutRef<typeof TabsPrimitive.Root>, 'value' | 'defaultValue' | 'onValueChange' | 'className'> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  className?: string
  animateContent?: boolean
}

export type TabsListProps = Omit<ComponentPropsWithoutRef<typeof TabsPrimitive.List>, 'className'> & { className?: string }

export type TabsTriggerProps = Omit<ComponentPropsWithoutRef<typeof TabsPrimitive.Tab>, 'className' | 'value'> & {
  className?: string
  value: string
}

export type TabsContentProps = Omit<ComponentPropsWithoutRef<typeof TabsPrimitive.Panel>, 'className' | 'value'> & {
  className?: string
  value: string
  keepMounted?: boolean
}

export type TabsContextValue = Readonly<{
  active: string
  layoutId: string
  direction: number
  animateContent: boolean
  panelHeightRef: RefObject<number | null>
  leavingRectRef: RefObject<DOMRect | null>
}>
