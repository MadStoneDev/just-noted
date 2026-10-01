"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { IconX } from "@tabler/icons-react";

// "What is JustNoted?" — the story behind the app. Opens inside the app shell
// (rail + full-width content), the same way Roadmap and Pricing do.

function Brand() {
  return <span className="font-medium text-[var(--color-ink-1)]">JustNoted</span>;
}

export default function TheWhatView() {
  const router = useRouter();
  const onClose = () => router.push("/");

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-[var(--color-canvas)]">
      <div className="mx-auto max-w-[680px] px-6 md:px-10 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="font-[family-name:var(--font-editor)] text-[34px] leading-[1.05] font-medium tracking-[-0.01em] text-[var(--color-ink)]">
              What is JustNoted?
            </h1>
            <p className="mt-1.5 text-[13px] text-[var(--color-ink-5)]">
              The short version: my solution for distraction-free note-taking.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-7)] text-[var(--color-ink-4)] hover:bg-[var(--color-raised-soft)] hover:text-[var(--color-ink-1)] transition-colors shrink-0"
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 text-[14px] leading-[1.65] text-[var(--color-ink-2)]">
          <p>
            I could probably summarise everything below with this one sentence: <Brand /> is my
            solution for distraction-free note taking.
          </p>
          <p>
            That's it 🤷‍♂️. That's why I made <Brand />, but if you're looking for a bit more detail
            then, by all means, please read on.
          </p>
          <p>
            I created <Brand /> because I was constantly frustrated with the lack of simple
            note-taking options out there. Hear me out, I know there are a million and one different
            note-taking apps and websites but not like what I was looking for. I wanted something
            that just works – you visit the page and immediately start typing. No messing around
            with logins, no waiting for pages to load, none of that stuff that gets in the way when
            you just need to write something down quickly.
          </p>
          <p>
            With <Brand />, I made sure to include features that actually matter. You can see your
            word and character counts as you type, and create unlimited notes without any
            restrictions. Your notes are saved automatically, and you can choose how you want to
            access them – keep notes local that you don't need everywhere you go, or create a free
            account to sync your notes across all your devices. If you're wondering how I made this
            work, or you're worried about your privacy, check out{" "}
            <button
              onClick={() => router.push("/the-how")}
              className="font-semibold text-[var(--color-accent-text)] hover:underline"
            >
              The How
            </button>
            .
          </p>
          <p>
            <Brand /> came out of a genuine every day need. I couldn't access notepad on all my
            devices, but I constantly needed somewhere to quickly type phone numbers, temporary
            passwords, or notes while on calls. I needed a space to brainstorm ideas or draft social
            media posts without committing them to permanent storage somewhere. I just wanted a
            place where my thoughts could live temporarily until I was ready to move them elsewhere
            or delete them.
          </p>
          <p>
            I looked everywhere for something this straightforward that wouldn't force me to create
            an account or pay for features I didn't need 🙄. When I couldn't find it, I decided to
            build it myself. That's how <Brand /> was born – my answer to overcomplicated
            note-taking apps. And while you can now create an account if you want your notes
            everywhere, you still don't have to. The choice is yours.
          </p>
          <p>
            Now, I'll be honest – since launching <Brand />, I've added a few extra features.
            Notebooks to organise your notes, a split view to reference one note while writing
            another, even a table of contents for longer pieces. But here's the thing: you don't
            have to use any of it. If all you want is a blank page to type on, that's exactly what
            you'll get. The extras are there if you need them, tucked away until you don't. <Brand />{" "}
            can be as simple or as organised as you want it to be 👌.
          </p>
          <p>
            Do you have any ideas of how I can improve <Brand />? Are you saying it's not perfect?
            🤨 Yeah, fair enough 😆. Alright, shoot me an email and let me know your ideas. I would
            love for this project to serve as many people as possible while remaining simple and
            intuitive 🙌.
          </p>
        </div>
      </div>
    </div>
  );
}
