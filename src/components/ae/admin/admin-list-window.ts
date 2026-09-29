export const ADMIN_LIST_WINDOW = 50
export const ADMIN_LIST_WINDOW_MAX = 500

export function nextAdminListWindow(current: number | undefined): number | undefined {
  const base = current ?? ADMIN_LIST_WINDOW
  const next = Math.min(ADMIN_LIST_WINDOW_MAX, base + ADMIN_LIST_WINDOW)
  return next === base ? undefined : next
}
