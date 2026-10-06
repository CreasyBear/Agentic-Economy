import type { ComponentProps } from 'react'

// TanStack compatibility target for Arc Avatar's undeclared `next/image` import.
type ImageProps = Readonly<ComponentProps<'img'> & { fill?: boolean; priority?: boolean; src: string }>

export default function Image({
  fill,
  priority,
  loading,
  fetchPriority,
  style,
  ...props
}: ImageProps) {
  const imageStyle = fill
    ? { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', ...style }
    : style

  return (
    <img
      {...props}
      loading={priority ? 'eager' : loading ?? 'lazy'}
      fetchPriority={priority ? 'high' : fetchPriority}
      style={imageStyle}
    />
  )
}
