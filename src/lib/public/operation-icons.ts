import {
  BlocksIcon,
  DatabaseIcon,
  ImageIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  WalletIcon,
  WrenchIcon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

/**
 * Operation categories arrive at these surfaces as persisted strings
 * (`marketCategories` ids inferred per operation by
 * `@/modules/market/listing-evidence`), so icon identity is resolved from
 * data at render time rather than imported directly per surface. Unknown or
 * empty stored keys fall back to the neutral glyph instead of crashing a
 * card, tab, or tile.
 *
 * Curated registry cap: <= 24 glyphs. Static import by repo standards (the
 * specifier is a literal); seven tree-shaken lucide icons keep bundle cost
 * negligible while keeping every dependency reviewable.
 */
export const OPERATION_CATEGORY_ICONS = {
  "data-research": DatabaseIcon,
  finance: WalletIcon,
  "identity-compliance": ShieldCheckIcon,
  commerce: ShoppingCartIcon,
  media: ImageIcon,
  "developer-tools": WrenchIcon,
  other: BlocksIcon,
} as const satisfies Record<string, ComponentType<SVGProps<SVGSVGElement>>>;

/** Neutral glyph key for any category string outside the curated map. */
export const OPERATION_CATEGORY_FALLBACK_ICON_NAME = "other" as const;

export type OperationCategoryIconName = keyof typeof OPERATION_CATEGORY_ICONS;

export type OperationCategoryIconComponent = ComponentType<
  SVGProps<SVGSVGElement>
>;

/**
 * Resolves a stored category string to the curated lucide icon component.
 * Unknown or empty keys resolve to {@link OPERATION_CATEGORY_FALLBACK_ICON_NAME}
 * so bad stored data never throws at render time.
 */
export function resolveOperationCategoryIcon(
  categoryKey: string | undefined,
): OperationCategoryIconComponent {
  if (categoryKey !== undefined) {
    const named = OPERATION_CATEGORY_ICONS[
      categoryKey as keyof typeof OPERATION_CATEGORY_ICONS
    ];
    if (named !== undefined) return named;
  }
  return OPERATION_CATEGORY_ICONS[OPERATION_CATEGORY_FALLBACK_ICON_NAME];
}
