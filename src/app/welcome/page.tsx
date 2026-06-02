import React from "react";
import Link from "next/link";
import GlobalHeader from "@/components/global-header";
import GlobalFooter from "@/components/global-footer";
import { createClient } from "@/utils/supabase/server";
import {
  IconPencil,
  IconLock,
  IconDevices,
  IconMarkdown,
  IconMoon,
  IconShare,
  IconNotebook,
  IconBolt,
} from "@tabler/icons-react";

export const metadata = {
  title: "JustNoted — Distraction-Free Note Taking",
  description:
    "A minimalist markdown note-taking app. Write, organize, share. No distractions.",
};

export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <GlobalHeader user={user} />

      <main className="flex-grow pt-14">
        {/* Hero */}
        <section className="max-w-3xl mx-auto px-6 pt-20 pb-16 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-[var(--color-text-primary)] tracking-tight leading-tight">
            Write without
            <br />
            <span className="text-[var(--color-accent)]">distractions</span>
          </h1>
          <p className="mt-4 text-lg text-[var(--color-text-secondary)] max-w-lg mx-auto leading-relaxed">
            A minimalist markdown editor that stays out of your way.
            Organize with notebooks, sync across devices, share with anyone.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/get-access"
              className="px-6 py-2.5 text-sm font-medium bg-[var(--color-accent)] text-[var(--color-text-on-accent)] hover:bg-[var(--color-accent-hover)] rounded-[var(--radius-md)] transition-colors"
            >
              Get Started — Free
            </Link>
            <Link
              href="/"
              className="px-6 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] hover:bg-[var(--color-hover)] transition-colors"
            >
              Open App
            </Link>
          </div>
        </section>

        {/* Features grid */}
        <section className="max-w-4xl mx-auto px-6 pb-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Feature
              icon={<IconMarkdown size={20} />}
              title="Markdown native"
              description="Typora-style inline rendering. Type markdown, see it formatted instantly. No split panes."
            />
            <Feature
              icon={<IconBolt size={20} />}
              title="Slash commands"
              description="Type / for headings, lists, code blocks, quotes. Select text for a floating toolbar."
            />
            <Feature
              icon={<IconNotebook size={20} />}
              title="Notebooks & tags"
              description="Organize notes into notebooks with custom covers. Set word goals and track progress."
            />
            <Feature
              icon={<IconMoon size={20} />}
              title="Dark mode"
              description="Light, dark, or system. Every surface respects your preference."
            />
            <Feature
              icon={<IconDevices size={20} />}
              title="Sync everywhere"
              description="Notes save locally first, sync to the cloud in the background. Works offline."
            />
            <Feature
              icon={<IconShare size={20} />}
              title="Share notes"
              description="Public or private links. Password protection. Anonymous sharing. Expiration dates."
            />
            <Feature
              icon={<IconLock size={20} />}
              title="Privacy first"
              description="Your notes are yours. End-to-end encrypted sync. Self-hostable backend."
            />
            <Feature
              icon={<IconPencil size={20} />}
              title="Distraction free"
              description="No menus, no chrome. Just you and your words. Focus mode hides everything."
            />
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-3xl mx-auto px-6 pb-20 text-center">
          <div className="p-8 rounded-[var(--radius-xl)] bg-[var(--color-bg-tertiary)] border border-[var(--color-border-secondary)]">
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Start writing today
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Free forever. No credit card required.
            </p>
            <Link
              href="/get-access"
              className="mt-4 inline-block px-6 py-2.5 text-sm font-medium bg-[var(--color-accent)] text-[var(--color-text-on-accent)] hover:bg-[var(--color-accent-hover)] rounded-[var(--radius-md)] transition-colors"
            >
              Get Started
            </Link>
          </div>
        </section>
      </main>

      <GlobalFooter />
    </>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-5 rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)] hover:border-[var(--color-border-primary)] transition-colors">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[var(--color-accent)]">{icon}</span>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
      </div>
      <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{description}</p>
    </div>
  );
}
