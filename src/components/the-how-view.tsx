"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  IconCheck,
  IconCircleCheck,
  IconCloud,
  IconDeviceFloppy,
  IconDownload,
  IconEdit,
  IconFileTypeTxt,
  IconLoader,
  IconNote,
  IconNotebook,
  IconPencil,
  IconShieldLock,
  IconSquareRoundedPlus,
  IconTrash,
  IconX,
  IconLayoutColumns,
  IconList,
  IconCheckbox,
} from "@tabler/icons-react";

// "How does JustNoted work?" — the feature walkthrough. Opens inside the app
// shell (rail + full-width content), the same way Roadmap and Pricing do.

function Brand() {
  return <span className="font-medium text-[var(--color-ink-1)]">JustNoted</span>;
}

function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="mt-6 pb-2 border-b border-[var(--color-hairline)] font-semibold text-[16px] text-[var(--color-ink-1)] flex items-center gap-2">
      {icon} {children}
    </h2>
  );
}

// Inline icon chip used to point at a toolbar button in the prose.
function Chip({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`mx-0.5 inline-flex items-center gap-1 align-middle rounded-[var(--radius-md)] bg-[var(--color-raised-soft)] p-1 ${
        accent
          ? "border border-[var(--color-accent-tint-border)] text-[var(--color-accent-text)]"
          : "border border-[var(--color-hairline)] text-[var(--color-ink-2)]"
      }`}
    >
      {children}
    </span>
  );
}

export default function TheHowView() {
  const router = useRouter();
  const onClose = () => router.push("/");

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-[var(--color-canvas)]">
      <div className="mx-auto max-w-[720px] px-6 md:px-10 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="font-[family-name:var(--font-editor)] text-[34px] leading-[1.05] font-medium tracking-[-0.01em] text-[var(--color-ink)]">
              How does JustNoted work?
            </h1>
            <p className="mt-1.5 text-[13px] text-[var(--color-ink-5)]">
              A quick tour of the features — use what you need, ignore the rest.
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
        <div className="flex flex-col gap-4 text-[14px] leading-[1.65] text-[var(--color-ink-2)]">
          <SectionHeading icon={<IconNote size={18} strokeWidth={2} />}>
            Creating &amp; Saving Notes
          </SectionHeading>
          <p>
            Creating a note on <Brand /> couldn't be easier. When you first load the page, you'll
            see an empty note waiting for your thoughts. Just start typing and, if you need another
            note, just click/tap the{" "}
            <Chip>
              <IconSquareRoundedPlus size={18} stroke={2} /> Add a new note
            </Chip>{" "}
            button.
          </p>
          <p>
            Your work is automatically saved 2 seconds after you stop typing. You'll see a{" "}
            <span className="mx-0.5 inline-flex items-center gap-1 align-middle text-[var(--color-ink-5)]">
              <IconLoader size={16} className="animate-spin" /> <strong>Saving…</strong>
            </span>{" "}
            indicator followed by a{" "}
            <span className="mx-0.5 inline-flex items-center gap-1 align-middle text-[var(--color-accent-text)]">
              <IconCircleCheck size={16} /> <strong>Saved</strong>
            </span>{" "}
            confirmation once it's complete.
          </p>
          <p>
            If the auto-save doesn't trigger for some reason, or you just want the peace of mind of a
            manual save, hit the{" "}
            <Chip accent>
              <IconDeviceFloppy size={18} strokeWidth={2} />
            </Chip>{" "}
            button anytime.
          </p>

          <SectionHeading icon={<IconCloud size={18} strokeWidth={2} />}>
            Local Notes vs Cloud Notes
          </SectionHeading>
          <p>
            <Brand /> offers two types of notes to suit different needs:
          </p>
          <p>
            <span className="font-semibold text-[var(--color-ink-1)]">Local Notes</span> are perfect
            for quick, anonymous note-taking. They're automatically saved and tied to your specific
            device and browser – no account required. These notes will be there when you return, as
            long as you're using the same browser on the same device and haven't cleared your
            browser data. Think of them as your private scratchpad that's always ready when you need
            it.
          </p>
          <p>
            <span className="font-semibold text-[var(--color-ink-1)]">Cloud Notes</span> require a
            free account but give you the flexibility to access your notes from any device or
            browser. Perfect for notes you want to keep long-term or access across multiple devices.
            Your cloud notes are securely tied to your account and sync automatically.
          </p>
          <p>
            Both types save automatically and work exactly the same way – the only difference is
            where they're stored and from where you can access them.
          </p>

          <SectionHeading icon={<IconEdit size={18} strokeWidth={2} />}>
            Changing the Title of Your Note
          </SectionHeading>
          <p>
            If you want to change the title of your note, hover over the title (on mobile: tap on
            the title) and then click/tap the{" "}
            <Chip accent>
              <IconPencil size={18} strokeWidth={2} />
            </Chip>{" "}
            button. This will let you type in a new title. When you're done, just click/tap the{" "}
            <Chip accent>
              <IconCheck size={18} strokeWidth={2} />
            </Chip>{" "}
            button to save your changes or click/tap the{" "}
            <span className="mx-0.5 inline-flex items-center align-middle rounded-[var(--radius-md)] bg-[var(--color-raised-soft)] border border-[var(--color-hairline)] p-1 text-[var(--color-danger)]">
              <IconX size={18} strokeWidth={2} />
            </span>{" "}
            button to cancel your changes.
          </p>

          <SectionHeading icon={<IconDownload size={18} strokeWidth={2} />}>
            Downloading Your Notes
          </SectionHeading>
          <p>
            Need to take your note elsewhere? Just click/tap the{" "}
            <Chip accent>
              <IconFileTypeTxt size={18} strokeWidth={2} />
            </Chip>{" "}
            button to download your note as a simple .txt file. These files can be opened on
            virtually any device, so your thoughts are always portable.
          </p>

          <SectionHeading icon={<IconTrash size={18} strokeWidth={2} />}>
            Deleting Notes
          </SectionHeading>
          <p>
            Once you're done with a note and don't need it anymore, click/tap the{" "}
            <Chip>
              <IconTrash size={18} strokeWidth={2} />
            </Chip>{" "}
            button. You'll get a quick confirmation (just to make sure you're certain), and then
            it's gone forever. Really forever – I don't keep backups of deleted notes, whether
            they're local or cloud.
          </p>

          <SectionHeading icon={<IconNotebook size={18} strokeWidth={2} />}>
            Organising with Notebooks
          </SectionHeading>
          <p>
            Look, I know I said <Brand /> was meant to be simple, and it still is. But sometimes you
            end up with a lot of notes and need a bit of organisation without the fuss. That's where
            notebooks come in.
          </p>
          <p>
            If you have a cloud account, you can create notebooks to group your notes together.
            Working on a novel? Make a notebook for it. Got a bunch of work notes? Another notebook.
            You can even customise each notebook with different covers – solid colours, gradients, or
            photos. It's a small thing, but it helps you find what you're looking for at a glance.
          </p>
          <p>
            Don't want to use notebooks? That's completely fine. Your notes will just live in "All
            Notes" like they always have. The feature is there when you need it, invisible when you
            don't 🤷‍♂️.
          </p>

          <SectionHeading icon={<IconLayoutColumns size={18} strokeWidth={2} />}>
            Split View for Referencing Notes
          </SectionHeading>
          <p>
            Ever been writing something and needed to check another note? Used to be you'd have to
            scroll up, lose your place, scroll back down, forget what you read, scroll up again...
            you get it. It's annoying.
          </p>
          <p>
            Split view fixes that. Click the split view button in the toolbar and your screen
            divides in two – your current note on one side, a reference note on the other. You can
            pick any note to reference, resize the panes however you like, and even switch between
            side-by-side or top-and-bottom layouts. When you're done, just close it and you're back
            to normal.
          </p>
          <p>
            Keyboard shortcut: <span className="font-medium text-[var(--color-ink-1)]">Ctrl+Shift+S</span>{" "}
            (or <span className="font-medium text-[var(--color-ink-1)]">Cmd+Shift+S</span> on Mac)
            toggles it on and off.
          </p>

          <SectionHeading icon={<IconList size={18} strokeWidth={2} />}>
            Table of Contents
          </SectionHeading>
          <p>
            If you're writing something longer – maybe an article, a story, or just a really
            detailed plan – the table of contents can help you navigate. It automatically picks up
            any headings you've added to your note and lists them in a panel on the right.
          </p>
          <p>
            Click any heading in the list and you'll jump straight to it in your note. The current
            section gets highlighted as you scroll, so you always know where you are. It's genuinely
            useful for longer pieces, and completely ignorable for quick notes.
          </p>
          <p>
            Toggle it with the{" "}
            <Chip accent>
              <IconList size={18} strokeWidth={2} />
            </Chip>{" "}
            button in the toolbar, or use{" "}
            <span className="font-medium text-[var(--color-ink-1)]">Ctrl+Shift+T</span>.
          </p>

          <SectionHeading icon={<IconCheckbox size={18} strokeWidth={2} />}>
            Bulk Actions
          </SectionHeading>
          <p>
            Got a bunch of notes that need to move to a notebook? You don't have to do them one by
            one. In the sidebar, there's a select mode that lets you tick multiple notes and move
            them all at once. Select what you need, pick the destination, done.
          </p>

          <SectionHeading icon={<IconDownload size={18} strokeWidth={2} />}>
            Exporting Notebooks
          </SectionHeading>
          <p>
            Sometimes you need to take your notes somewhere else – maybe you're backing up a
            project, or you want to share a collection with someone. When you're viewing a notebook,
            you'll see an export button that lets you download all the notes in that notebook at
            once.
          </p>
          <p>
            You can export as plain text (.txt), Markdown (.md), HTML (for web viewing), or JSON (if
            you're a dev who wants the raw data). Pick what works for you.
          </p>

          <SectionHeading icon={<IconShieldLock size={18} strokeWidth={2} />}>
            How Your Privacy Is Protected
          </SectionHeading>
          <p>
            I built <Brand /> with privacy in mind. For local notes, no information about your
            computer or browser is stored in the database. <Brand /> creates a randomly generated
            code that serves as an anonymous token for your browser. This token is saved only in
            your browser. When you return to <Brand />, it checks for this token to retrieve your
            notes. (The word "Local" is not an indication of where the notes are saved but what type
            of access you need to access them.)
          </p>
          <p>
            <Brand /> knows nothing about your browser type or device for local notes – none of that
            is tied to your notes. For cloud notes with an account, only your email and the notes
            themselves are stored, nothing more.
          </p>
          <p>
            Both local and cloud notes are stored in separate secure databases. Local notes use a
            privacy-focused approach where your device signature never leaves your browser, while
            cloud notes are securely tied to your account credentials.
          </p>
          <p>
            When you delete a note, whether local or cloud, it's permanently deleted with no backups
            kept. Your data is yours, and when you say it's gone, it's truly gone.
          </p>
          <p>
            For local notes, it's more likely that <Brand /> will create a separate
            randomly-generated token for you (for example, if you clear your browser storage or
            cache) than it is for anyone to ever see your notes. This is why cloud notes with an
            account are recommended if you want guaranteed access across devices.
          </p>
          <p>
            If you haven't yet, please check out{" "}
            <button
              onClick={() => router.push("/the-what")}
              className="font-semibold text-[var(--color-accent-text)] hover:underline"
            >
              The What
            </button>{" "}
            page to learn more about what <Brand /> is.
          </p>
        </div>
      </div>
    </div>
  );
}
