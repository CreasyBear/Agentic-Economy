import type { z } from 'zod'

/** TypeScript branding preserves the wire string and its source validators. */
export function brandedStringSchema<Output extends string>(
  schema: z.ZodString,
  brand: (value: string) => Output,
): z.ZodType<Output, string> {
  return schema.overwrite(brand) as z.ZodString & z.ZodType<Output, string>
}
