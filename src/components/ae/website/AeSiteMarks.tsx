const PLUS_PATH = 'M1.5 7.5H13.5M7.5 13.5V1.5'

export function AePlusMark({ sizePx = 12 }: { sizePx?: number }) {
  return (
    <svg
      fill="none"
      height={sizePx}
      overflow="visible"
      viewBox="0 0 15 15"
      width={sizePx}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="block"
    >
      <path
        d={PLUS_PATH}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeMiterlimit={10}
        strokeWidth={1.25}
      />
    </svg>
  )
}

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const

const cornerClass: Record<(typeof CORNERS)[number], string> = {
  'top-left': 'left-[-7.5px] top-[-7.5px]',
  'top-right': 'right-[-7.5px] top-[-7.5px]',
  'bottom-left': 'bottom-[-7.5px] left-[-7.5px]',
  'bottom-right': 'bottom-[-7.5px] right-[-7.5px]',
}

/** Plus marks pinned to the nearest positioned ancestor — Twenty CornerMarkers. */
export function AeCornerMarks() {
  return (
    <>
      {CORNERS.map((corner) => (
        <span
          key={corner}
          aria-hidden="true"
          className={`pointer-events-none absolute text-info ${cornerClass[corner]}`}
        >
          <AePlusMark sizePx={14} />
        </span>
      ))}
    </>
  )
}

export function AeMarkedDivider({ orientation = 'auto' }: { orientation?: 'auto' | 'horizontal' | 'vertical' }) {
  const vertical = orientation === 'vertical'
  const auto = orientation === 'auto'

  return (
    <div
      role="separator"
      className={
        vertical
          ? 'flex h-full w-auto flex-col items-center gap-1.5 text-info'
          : auto
            ? 'flex w-full items-center gap-1.5 text-info md:h-full md:w-auto md:flex-col'
            : 'flex w-full items-center gap-1.5 text-info'
      }
    >
      <AePlusMark sizePx={12} />
      <div
        aria-hidden="true"
        className={
          vertical
            ? 'min-h-0 w-px flex-1 bg-border'
            : auto
              ? 'h-px min-w-0 flex-1 bg-border md:h-auto md:min-h-0 md:w-px'
              : 'h-px min-w-0 flex-1 bg-border'
        }
      />
      <AePlusMark sizePx={12} />
    </div>
  )
}

/** Desktop-only open-top bracket that joins a section to the band above it. */
export function AeConnectingFrame() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden md:block">
      <div className="absolute bottom-12 top-0 left-[var(--ae-gutter-lg)] right-[var(--ae-gutter-lg)]">
        <span className="absolute inset-x-5 bottom-0 h-px bg-border" />
        <span className="absolute bottom-5 left-0 top-0 w-px bg-border" />
        <span className="absolute bottom-5 right-0 top-0 w-px bg-border" />
        <span className="absolute bottom-[-6.5px] left-[-6.5px] text-info">
          <AePlusMark sizePx={14} />
        </span>
        <span className="absolute bottom-[-6.5px] right-[-6.5px] text-info">
          <AePlusMark sizePx={14} />
        </span>
      </div>
    </div>
  )
}

type AeGuideCrosshairProps = {
  crossX: string
  crossY: string
}

/** Desktop-only construction lines with a plus at the crossing — Twenty GuideCrosshair. */
export function AeGuideCrosshair({ crossX, crossY }: AeGuideCrosshairProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden md:block"
      style={{
        ['--cross-x' as string]: crossX,
        ['--cross-y' as string]: crossY,
        ['--cross-gap' as string]: '18px',
      }}
    >
      <span className="absolute top-[var(--cross-y)] left-0 h-px w-[calc(var(--cross-x)-var(--cross-gap))] bg-border" />
      <span className="absolute top-[var(--cross-y)] right-0 h-px w-[calc(100%-var(--cross-x)-var(--cross-gap))] bg-border" />
      <span className="absolute top-0 left-[var(--cross-x)] h-[calc(var(--cross-y)-var(--cross-gap))] w-px bg-border" />
      <span className="absolute top-[calc(var(--cross-y)+var(--cross-gap))] left-[var(--cross-x)] h-[calc(100%-var(--cross-y)-var(--cross-gap))] w-px bg-border" />
      <span className="absolute top-[var(--cross-y)] left-[var(--cross-x)] size-3 -translate-x-1/2 -translate-y-1/2">
        <span className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-info" />
        <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-info" />
      </span>
    </div>
  )
}
