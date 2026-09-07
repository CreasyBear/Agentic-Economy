import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { Route } from "@/routes/tools";

describe("Tools index redirect", () => {
  it("redirects only the index and leaves Tool detail routes reachable", () => {
    const beforeLoad = Route.options.beforeLoad;
    if (beforeLoad === undefined) throw new Error("Tools redirect is unavailable");

    expect(() =>
      beforeLoad({
        location: { pathname: "/tools/operation:v1:detail" },
      } as never),
    ).not.toThrow();

    try {
      beforeLoad({ location: { pathname: "/tools" } } as never);
      throw new Error("Tools index did not redirect");
    } catch (error) {
      expect(isRedirect(error)).toBe(true);
    }
  });
});
