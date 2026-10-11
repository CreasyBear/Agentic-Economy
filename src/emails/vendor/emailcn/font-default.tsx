// Vendored from emailcn (MIT, Copyright (c) 2026 Shadcn Labs), see ./LICENSE.
// Source: https://www.emailcn.run/r/react-email/default-fonts.json (registry/bases/react-email/fonts/font-default.tsx), fetched 2026-10-11. Local rewrite: import "react-email" to "@react-email/components" (1.0.12). Do not hand-edit; theme goes in src/emails/theme.ts. Pins and props: ./upstream-manifest.json.
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
