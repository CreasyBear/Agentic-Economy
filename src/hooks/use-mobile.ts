import * as React from "react"

const MOBILE_BREAKPOINT = 768

export type ViewportKind = "unknown" | "mobile" | "desktop"

function readViewportKind(): Exclude<ViewportKind, "unknown"> {
  return window.innerWidth < MOBILE_BREAKPOINT ? "mobile" : "desktop"
}

/** Unknown until the media query has run. Do not treat unknown as desktop. */
export function useViewportKind(): ViewportKind {
  const [kind, setKind] = React.useState<ViewportKind>("unknown")

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const sync = () => {
      setKind(readViewportKind())
    }
    sync()
    mql.addEventListener("change", sync)
    return () => mql.removeEventListener("change", sync)
  }, [])

  return kind
}

export function useIsMobile() {
  return useViewportKind() === "mobile"
}
