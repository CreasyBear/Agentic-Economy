import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { Route } from "@/routes/operations";

describe("operations index redirect", () => {
  it("redirects only the index and leaves operation detail routes reachable", () => {
    const beforeLoad = Route.options.beforeLoad;
    if (beforeLoad === undefined) throw new Error("operations redirect is unavailable");

    expect(() =>
      beforeLoad({
        location: { pathname: "/operations/operation:v1:detail" },
      } as never),
    ).not.toThrow();

    try {
      beforeLoad({ location: { pathname: "/operations" } } as never);
      throw new Error("operations index did not redirect");
    } catch (error) {
      expect(isRedirect(error)).toBe(true);
    }
  });
});
