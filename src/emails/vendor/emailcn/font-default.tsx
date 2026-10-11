// @ts-nocheck vendored upstream code is not written for exactOptionalPropertyTypes/noUncheckedIndexedAccess; our own wrappers in src/emails are checked.
// T2 must drop this Inter @import (rsms.me): doc 2.2 allows no webfont; stack is Manrope, -apple-system, Segoe UI, Arial, Helvetica, sans-serif. Imports rewritten from "react-email" to "@react-email/components" (1.0.12).
// Vendored from emailcn (MIT, Copyright (c) 2026 Shadcn Labs), see ./LICENSE.
// Source: https://www.emailcn.run/r/react-email/ (registry item for font-default.tsx), fetched 2026-10-11. Do not hand-edit; theme goes in src/emails/theme.ts.
import { Font } from "@react-email/components";

export const DefaultFonts = () => (
  <>
    <style
      dangerouslySetInnerHTML={{
        __html: `@import url('https://rsms.me/inter/inter.css');`,
      }}
    />
    <Font
      fontFamily="Inter"
      fallbackFontFamily={["Arial", "sans-serif"]}
      webFont={{
        format: "truetype",
        url: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuOKfMZg.ttf",
      }}
      fontWeight={400}
      fontStyle="normal"
    />
    <Font
      fontFamily="Inter"
      fallbackFontFamily={["Arial", "sans-serif"]}
      webFont={{
        format: "truetype",
        url: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf",
      }}
      fontWeight={500}
      fontStyle="normal"
    />
    <Font
      fontFamily="Inter"
      fallbackFontFamily={["Arial", "sans-serif"]}
      webFont={{
        format: "truetype",
        url: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf",
      }}
      fontWeight={600}
      fontStyle="normal"
    />
  </>
);
