import { v, type Infer } from 'convex/values'

export const ownerSupplyCommandResultValue = v.union(
  v.object({
    kind: v.literal('withdrawn'),
    publicationRef: v.string(),
    revision: v.number(),
    lifecycle: v.object({
      state: v.literal('withdrawn'),
      reasons: v.array(v.string()),
    }),
  }),
  v.object({
    kind: v.literal('refreshed'),
    publicationRef: v.string(),
    revision: v.number(),
    disposition: v.union(v.literal('current'), v.literal('incompatible')),
    lifecycle: v.object({
      state: v.union(
        v.literal('active'),
        v.literal('inactive'),
        v.literal('incompatible'),
      ),
      reasons: v.array(v.string()),
    }),
  }),
  v.object({
    kind: v.literal('republished'),
    publicationRef: v.string(),
    revision: v.number(),
    toolRef: v.string(),
    bindingId: v.string(),
    lifecycle: v.object({
      state: v.union(v.literal('active'), v.literal('inactive')),
      reasons: v.array(v.string()),
    }),
  }),
  v.object({ kind: v.literal('refused'), reason: v.string() }),
)

type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T

export type OwnerSupplyCommandWireResult = Infer<typeof ownerSupplyCommandResultValue>
export type OwnerSupplyCommandResult = DeepReadonly<OwnerSupplyCommandWireResult>
