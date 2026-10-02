"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { IconChevronLeft, IconChevronDown, IconLock, IconWorld } from "@tabler/icons-react";
import { getTool, type ToolMeta } from "@/lib/text-tools/registry";
import ToolsChrome from "@/components/tools/tools-chrome";
import ToolsFooter from "@/components/tools/tools-footer";
import SlugGenerator from "@/components/tools/slug-generator";
import CaseConverter from "@/components/tools/case-converter";

// Tool page template (spec §4): back link · H1 · description · tool · privacy
// line · How it works (+ FAQ) · footer. Rendered server-side (via the marker
// page) so the copy and JSON-LD are in the first HTML response.

function FaqList({ faq }: { faq: NonNullable<ToolMeta["faq"]> }) {
  // First item open; only one open at a time (button + region, not <details>).
  const [open, setOpen] = useState(0);
  return (
    <ul className="mt-8 border-t border-[var(--color-hairline-soft)]">
      {faq.map((item, i) => {
        const isOpen = open === i;
        return (
          <li key={i} className="border-b border-[var(--color-hairline-soft)]">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? -1 : i)}
              className="w-full flex items-center justify-between gap-3 py-4 text-left"
            >
              <span className={`text-[15px] font-semibold ${isOpen ? "text-[var(--color-ink)]" : "text-[var(--color-ink-1)]"}`}>
                {item.q}
              </span>
              <IconChevronDown
                size={14}
                className={`shrink-0 text-[var(--color-ink-3)] transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen && (
              <p className="pb-4 -mt-1 text-[14.5px] leading-[1.65] text-[var(--color-ink-3)]">{item.a}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function ToolView({ slug }: { slug: string }) {
  const router = useRouter();
  const tool = getTool(slug);

  if (!tool) {
    return (
      <ToolsChrome>
        <div className="mx-auto max-w-[760px] px-6 md:px-10 py-10">
          <button
            onClick={() => router.push("/tools")}
            className="inline-flex items-center gap-1 text-[13px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)] transition-colors"
          >
            <IconChevronLeft size={16} /> Tools
          </button>
          <p className="mt-8 text-[14px] text-[var(--color-ink-4)]">That tool doesn&apos;t exist.</p>
        </div>
      </ToolsChrome>
    );
  }

  const fetchTool = tool.slug === "og-tester";
  const canonicalUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://justnoted.app"}/tools/${tool.slug}`;

  // Structured data (spec §11): WebApplication, plus FAQPage when there's a FAQ.
  const webAppLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: tool.name,
    description: tool.description,
    url: canonicalUrl,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "AUD" },
    isAccessibleForFree: true,
  };
  const faqLd = tool.faq && tool.faq.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: tool.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }
    : null;

  return (
    <ToolsChrome>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppLd) }} />
      {faqLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      )}

      <div className="mx-auto max-w-[760px] px-6 md:px-10 py-8">
        {/* Back link */}
        <button
          onClick={() => router.push("/tools")}
          className="inline-flex items-center gap-1 h-8 -ml-1 text-[13px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)] transition-colors"
        >
          <IconChevronLeft size={16} /> Tools
        </button>

        {/* H1 + description (description visually hidden on mobile per §9.3, kept for SEO) */}
        <h1 className="mt-2.5 font-[family-name:var(--font-editor)] text-[30px] md:text-[40px] leading-[1.1] font-medium tracking-[-0.018em] text-[var(--color-ink)]">
          {tool.name}
        </h1>
        <p className="mt-2 hidden md:block text-[16px] leading-[1.55] text-[var(--color-ink-3)]">{tool.description}</p>
        <span className="sr-only md:hidden">{tool.description}</span>

        {/* The tool */}
        <div className="mt-6">
          {tool.slug === "slug-generator" && <SlugGenerator />}
          {tool.slug === "case-converter" && <CaseConverter />}
        </div>

        {/* Privacy line (§4.5) */}
        <div className="mt-3 flex items-center gap-2 text-[12.5px] text-[var(--color-ink-4)]">
          {fetchTool ? <IconWorld size={13} className="shrink-0" /> : <IconLock size={13} className="shrink-0" />}
          {fetchTool
            ? "We fetch the page to read its tags. Nothing is stored."
            : "Your text never leaves your device."}
        </div>

        {/* How it works (§4.6) */}
        {tool.howItWorks.length > 0 && (
          <section className="mt-16 max-w-[660px]">
            <h2 className="font-[family-name:var(--font-editor)] text-[28px] font-medium tracking-[-0.01em] text-[var(--color-ink)]">
              How it works
            </h2>
            <div className="mt-4 space-y-4">
              {tool.howItWorks.map((p, i) => (
                <p key={i} className="text-[15.5px] leading-[1.7] text-[var(--color-ink-2)]">{p}</p>
              ))}
            </div>
            {tool.faq && tool.faq.length > 0 && <FaqList faq={tool.faq} />}
          </section>
        )}

        {/* Footer (§4.7) — CTA + All tools + guest theme switch */}
        <ToolsFooter />
      </div>
    </ToolsChrome>
  );
}
