import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { marketWindowSchema } from "./contracts";
import {
  readMarketRouteProjection,
} from "./server";

const inputSchema = z.strictObject({
  window: marketWindowSchema,
  query: z.string().max(200).optional(),
  availability: z.enum(["routeable", "integrated", "unavailable"]).optional(),
  cursor: z.string().max(512).optional(),
});

export const readMarketRouteServer = createServerFn({ method: "GET" })
  .validator((data) => inputSchema.parse(data))
  .handler(
    async ({ data }) =>
      await readMarketRouteProjection(data.window, {
        ...(data.query === undefined ? {} : { query: data.query }),
        ...(data.availability === undefined
          ? {}
          : { availability: data.availability }),
        ...(data.cursor === undefined ? {} : { cursor: data.cursor }),
      }),
  );
