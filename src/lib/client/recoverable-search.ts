import { z } from "zod"

const unrecognizedFilter = "That filter is not recognized. Showing the full list."
const invalidLink = "This link is not valid. Nothing was opened."

function fieldLabel(key: string, labels: Readonly<Record<string, string>> | undefined): string {
  const named = labels?.[key]
  if (named !== undefined) return named
  return /^[A-Za-z][A-Za-z0-9_ -]{0,40}$/.test(key) ? key : "Unrecognized filter"
}

function ignoredMessage(labels: readonly string[]): string {
  const unique = [...new Set(labels)]
  if (unique.length === 0) return unrecognizedFilter
  const named = unique.length === 1
    ? unique[0] ?? "Unrecognized filter"
    : `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`
  return `Ignored ${named}. The other filters still apply.`
}

function ownNotice(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) return undefined
  if (value === unrecognizedFilter || value === invalidLink || value.startsWith("Ignored ")) return value
  return undefined
}

function readShapeField(shape: object, key: string): z.ZodType | undefined {
  if (!Object.hasOwn(shape, key)) return undefined
  const value: unknown = Object.getOwnPropertyDescriptor(shape, key)?.value
  return value instanceof z.ZodType ? value : undefined
}

function isStrictObject(schema: z.ZodType): boolean {
  if (!(schema instanceof z.ZodObject)) return false
  const catchall = (schema._def as { catchall?: { type?: string } }).catchall
  return catchall?.type === "never"
}

/**
 * Optional URL filters must not fail the route. Invalid fields are dropped,
 * valid fields stay, and a rejected notice names the ignored filter.
 * Identifier keys use the invalid-link notice and are not opened.
 */
export function recoverableSearch<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  options?: {
    identifierKeys?: readonly string[]
    ignoreUnknown?: boolean
    fieldLabels?: Readonly<Record<string, string>>
  },
): (search: unknown) => z.infer<z.ZodObject<T>> & { rejected?: string } {
  const identifierKeys = new Set(options?.identifierKeys ?? [])
  return (search: unknown): z.infer<z.ZodObject<T>> & { rejected?: string } => {
    if (search === null || typeof search !== "object" || Array.isArray(search)) {
      return { rejected: unrecognizedFilter } as z.infer<z.ZodObject<T>> & { rejected?: string }
    }
    const record = search as Record<string, unknown>
    const strict = isStrictObject(schema)
    const data: Record<string, unknown> = {}
    const ignored: string[] = []
    let identifierRejected = false
    for (const [key, value] of Object.entries(record)) {
      if (key === "rejected") continue
      const field = readShapeField(schema.shape, key)
      if (field === undefined) {
        if (strict && options?.ignoreUnknown !== true) ignored.push(fieldLabel(key, options?.fieldLabels))
        if (strict) data[key] = undefined
        continue
      }
      const parsed = field.safeParse(value)
      if (!parsed.success) {
        data[key] = undefined
        if (identifierKeys.has(key)) identifierRejected = true
        else if (options?.ignoreUnknown !== true) ignored.push(fieldLabel(key, options?.fieldLabels))
        continue
      }
      if (parsed.data !== undefined) data[key] = parsed.data
    }
    if (identifierRejected) return { ...data, rejected: invalidLink } as z.infer<z.ZodObject<T>> & { rejected?: string }
    if (ignored.length > 0) return { ...data, rejected: ignoredMessage(ignored) } as z.infer<z.ZodObject<T>> & { rejected?: string }
    const previous = options?.ignoreUnknown === true ? undefined : ownNotice(record.rejected)
    if (previous !== undefined) return { ...data, rejected: previous } as z.infer<z.ZodObject<T>> & { rejected?: string }
    return data as z.infer<z.ZodObject<T>> & { rejected?: string }
  }
}
