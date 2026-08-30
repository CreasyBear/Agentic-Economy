import { useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function AeSiteEntrance({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (element === null) {
      return undefined
    }

    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setVisible(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting === true) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      data-ae-visible={visible ? '' : undefined}
      className={cn(
        'h-full w-full motion-reduce:opacity-100',
        visible ? 'opacity-100' : 'opacity-0',
        'transition-opacity duration-500 ease-out motion-reduce:transition-none',
      )}
    >
      {children}
    </div>
  )
}
