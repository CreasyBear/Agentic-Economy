// @ts-nocheck vendored upstream code is not written for exactOptionalPropertyTypes/noUncheckedIndexedAccess; our own wrappers in src/emails are checked.
// Vendored from emailcn (MIT, Copyright (c) 2026 Shadcn Labs), see ./LICENSE.
// Source: https://www.emailcn.run/r/react-email/ (registry item for onboarding-default.tsx), fetched 2026-10-11. Do not hand-edit; theme goes in src/emails/theme.ts.
// Subject: Welcome to {_productName}

import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

import { ContentSection as ContentGridSection } from "./content";
import { CallToActionSection as CTABannerSection } from "./call-to-action";
import { NavigationFooterSection as FooterSection } from "./navigation-footer";
import { SplitHeroSection as HeroSection } from "./split-hero";
import { createEmailTailwindConfig } from "./email-theme";
import { emailAsset } from "./email-assets";
import { defaultTheme } from "./theme-default";

interface Props {
  _firstName?: string;
  _productName?: string;
  ctaHref?: string;
  _senderName?: string;
  _senderTitle?: string;
  _senderAvatarUrl?: string;
}

export const OnboardingDefault = ({
  _firstName = "there",
  _productName = "Acme",
  ctaHref = "https://example.com",
  _senderName = "Team",
  _senderTitle,
  _senderAvatarUrl,
}: Props) => {
  void _senderAvatarUrl;
  void _senderTitle;

  const t = defaultTheme;

  return (
    <Html>
      <Head />
      <Preview>
        Welcome to {_productName}, {_firstName}
      </Preview>
      <Tailwind config={createEmailTailwindConfig(t)}>
        <Body className="bg-background font-sans">
          <Container className="mx-auto max-w-container p-8">
            <Section className="py-4">
              <Text className="text-lg font-bold text-foreground">
                {_productName}
              </Text>
            </Section>

            <HeroSection
              heading={`Welcome, ${_firstName}`}
              subheading={`We're excited to have you on board at ${_productName}. Let's get you set up for success.`}
              ctaLabel="Get Started"
              ctaHref={ctaHref}
            />

            <ContentGridSection layout="title" title="Quick Setup" />

            <CTABannerSection
              heading="Ready to dive in?"
              subtext="Start building with our intuitive dashboard."
              ctaLabel="Get Started"
              ctaHref={ctaHref}
            />

            <Section className="py-4">
              <Text className="text-sm text-foreground-muted">
                Sent by {_senderName}
              </Text>
            </Section>

            <FooterSection text={_productName} />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

OnboardingDefault.PreviewProps = {
  _firstName: "Aniket",
  _productName: "Acme",
  _senderAvatarUrl: emailAsset("avatars/avatar-1.jpg"),
  _senderName: "The team",
  _senderTitle: "Team",
  ctaHref: "https://example.com/dashboard",
} satisfies Props;
