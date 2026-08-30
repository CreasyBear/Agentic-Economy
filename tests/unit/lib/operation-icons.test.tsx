/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../../setup/jsdom-platform";

import {
  OPERATION_CATEGORY_FALLBACK_ICON_NAME,
  OPERATION_CATEGORY_ICONS,
  resolveOperationCategoryIcon,
} from "@/lib/public/operation-icons";

afterEach(cleanup);

/** lucide stamps `lucide-<kebab>` on each rendered svg. */
function renderedSvgClass(categoryKey: string | undefined): string {
  const Icon = resolveOperationCategoryIcon(categoryKey);
  const { container } = render(<Icon aria-hidden />);
  const svg = container.querySelector("svg");
  if (svg === null) throw new Error(`no svg rendered for ${categoryKey}`)
  return svg.getAttribute("class") ?? ""
}

describe("resolveOperationCategoryIcon", () => {
  it("maps every curated market category id to a real rendered glyph", () => {
    for (const categoryKey of Object.keys(OPERATION_CATEGORY_ICONS)) {
      const className = renderedSvgClass(categoryKey);
      expect(className.length, `${categoryKey} must render an icon`).toBeGreaterThan(
        "lucide-".length,
      );
    }
  });

  it("falls back to one stable neutral glyph for unknown stored strings", () => {
    const fallbackClass = renderedSvgClass(OPERATION_CATEGORY_FALLBACK_ICON_NAME);
    for (const unknownKey of ["plumbing-and-drainage", ""] satisfies readonly string[]) {
      expect(renderedSvgClass(unknownKey)).toBe(fallbackClass);
    }
    expect(renderedSvgClass(undefined)).toBe(fallbackClass);
  });

  it("keeps the registry small and free of lazy wrappers or stored name strings", () => {
    // Values are the directly imported forwardRef components (React wraps
    // them in an object carrying $$typeof), never strings that need a second
    // lookup nor lazy payloads that suspend.
    const entries = Object.entries(OPERATION_CATEGORY_ICONS);
    expect(entries.length).toBeLessThanOrEqual(24);
    for (const [key, icon] of entries) {
      expect(icon == null, `${key} must be a real glyph`).toBe(false);
      expect((icon as { then?: unknown }).then, `${key} must not be a lazy payload`).toBeUndefined();
    }
  });
});

