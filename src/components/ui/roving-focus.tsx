"use client"

import * as React from "react"
import { useRender } from "@base-ui/react/use-render"

import { cn } from "@/lib/utils"

type Orientation = "horizontal" | "vertical"

type RovingFocusContextValue = {
  orientation: Orientation
  loop: boolean
  currentTabStopId: string | null
  setCurrentTabStopId: (tabStopId: string | null) => void
  onCurrentTabStopChange?: (target: EventTarget | null) => void
  registerItem: (tabStopId: string, element: HTMLElement | null) => void
}

const RovingFocusContext = React.createContext<RovingFocusContextValue | null>(
  null
)

function useRovingFocusContext(component: string) {
  const context = React.useContext(RovingFocusContext)
  if (context === null) {
    throw new Error(`${component} must be used within RovingFocusGroup.Root.`)
  }
  return context
}

function getOrderedTabStopIds(items: Map<string, HTMLElement>): string[] {
  return Array.from(items.keys())
}

type RootProps = Omit<React.ComponentProps<"div">, "children"> & {
  orientation?: Orientation
  loop?: boolean
  defaultTabStopId?: string
  defaultCurrentTabStopId?: string
  onCurrentTabStopChange?: (target: EventTarget | null) => void
  render?: useRender.RenderProp
  children?: React.ReactNode
}

function Root({
  orientation = "vertical",
  loop = false,
  defaultTabStopId,
  defaultCurrentTabStopId,
  onCurrentTabStopChange,
  render,
  children,
  className,
  onKeyDown,
  ...props
}: RootProps) {
  const itemsRef = React.useRef(new Map<string, HTMLElement>())
  const initialTabStopId =
    defaultTabStopId ?? defaultCurrentTabStopId ?? null
  const [currentTabStopId, setCurrentTabStopId] = React.useState<string | null>(
    initialTabStopId
  )

  const registerItem = React.useCallback(
    (tabStopId: string, element: HTMLElement | null) => {
      if (element === null) {
        itemsRef.current.delete(tabStopId)
        return
      }
      itemsRef.current.set(tabStopId, element)
    },
    []
  )

  const setCurrentTabStopIdAndNotify = React.useCallback(
    (tabStopId: string | null, target: EventTarget | null) => {
      setCurrentTabStopId(tabStopId)
      onCurrentTabStopChange?.(target)
    },
    [onCurrentTabStopChange]
  )

  const contextValue = React.useMemo<RovingFocusContextValue>(() => {
    const value: RovingFocusContextValue = {
      orientation,
      loop,
      currentTabStopId,
      setCurrentTabStopId: (tabStopId) => {
        setCurrentTabStopId(tabStopId)
      },
      registerItem,
    }
    if (onCurrentTabStopChange !== undefined) {
      value.onCurrentTabStopChange = onCurrentTabStopChange
    }
    return value
  }, [
    orientation,
    loop,
    currentTabStopId,
    onCurrentTabStopChange,
    registerItem,
  ])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    onKeyDown?.(event as React.KeyboardEvent<HTMLDivElement>)
    if (event.defaultPrevented) return

    const ids = getOrderedTabStopIds(itemsRef.current)
    if (ids.length === 0) return

    const currentIndex =
      currentTabStopId === null
        ? -1
        : ids.indexOf(currentTabStopId)

    const isVertical = orientation === "vertical"
    const nextKey = isVertical ? "ArrowDown" : "ArrowRight"
    const previousKey = isVertical ? "ArrowUp" : "ArrowLeft"

    let nextIndex: number | null = null

    switch (event.key) {
      case nextKey: {
        event.preventDefault()
        if (currentIndex === -1) {
          nextIndex = 0
          break
        }
        if (currentIndex >= ids.length - 1) {
          nextIndex = loop ? 0 : currentIndex
          break
        }
        nextIndex = currentIndex + 1
        break
      }
      case previousKey: {
        event.preventDefault()
        if (currentIndex === -1) {
          nextIndex = ids.length - 1
          break
        }
        if (currentIndex <= 0) {
          nextIndex = loop ? ids.length - 1 : 0
          break
        }
        nextIndex = currentIndex - 1
        break
      }
      case "Home": {
        event.preventDefault()
        nextIndex = 0
        break
      }
      case "End": {
        event.preventDefault()
        nextIndex = ids.length - 1
        break
      }
      default:
        return
    }

    if (nextIndex === null) return
    const nextId = ids[nextIndex]
    if (nextId === undefined) return
    const element = itemsRef.current.get(nextId)
    if (element === undefined) return
    setCurrentTabStopIdAndNotify(nextId, element)
    element.focus()
  }

  return (
    <RovingFocusContext.Provider value={contextValue}>
      {useRender({
        render,
        props: {
          role: "group",
          className,
          onKeyDown: handleKeyDown,
          children,
          ...props,
        },
        defaultTagName: "div",
      })}
    </RovingFocusContext.Provider>
  )
}

type ItemProps = Omit<React.ComponentProps<"span">, "children"> & {
  tabStopId?: string
  focusable?: boolean
  render?: useRender.RenderProp
  children?: React.ReactNode
}

function Item({
  tabStopId,
  focusable = true,
  render,
  children,
  className,
  onFocus,
  ...props
}: ItemProps) {
  const {
    currentTabStopId,
    setCurrentTabStopId,
    onCurrentTabStopChange,
    registerItem,
  } = useRovingFocusContext("RovingFocusGroup.Item")

  const isCurrentTabStop =
    tabStopId !== undefined && currentTabStopId === tabStopId

  const setRef = React.useCallback(
    (node: HTMLElement | null) => {
      if (tabStopId === undefined) return
      registerItem(tabStopId, node)
    },
    [registerItem, tabStopId]
  )

  return useRender({
    render,
    ref: setRef,
    props: {
      className: cn(
        focusable &&
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        className
      ),
      tabIndex: focusable ? (isCurrentTabStop ? 0 : -1) : undefined,
      onFocus: (event: React.FocusEvent<HTMLElement>) => {
        onFocus?.(event)
        if (event.defaultPrevented || tabStopId === undefined) return
        setCurrentTabStopId(tabStopId)
        onCurrentTabStopChange?.(event.currentTarget)
      },
      children,
      ...props,
    },
    defaultTagName: "span",
  })
}

export { Root, Item }
