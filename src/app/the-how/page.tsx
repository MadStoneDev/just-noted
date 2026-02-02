// src/app/the-how/page.tsx
import Link from "next/link";
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
import { createClient } from "@/utils/supabase/server";
import GlobalHeader from "@/components/global-header";
import React from "react";
import GlobalFooter from "@/components/global-footer";

export const metadata = {
  title: "The How - Just Noted",
  description:
    "With privacy in mind, Just Noted, the distraction-free note-taking app, saves your notes without stealing any" +
    " private information about you. Find out how it works.",
};

export default async function TheHowPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <GlobalHeader user={user} />
      <main className={`mt-2 flex-grow w-full overflow-hidden`}>
        <div className={`pt-3`}>
          <h1 className={`text-xl font-semibold sm:text-center`}>
            How does{" "}
            <span className={`p-1 bg-mercedes-primary font-secondary`}>
              Just
              <span className={`text-white`}>Noted</span>
            </span>{" "}
            work?
          </h1>

          <section
            className={`sm:mx-auto mt-5 flex flex-col gap-6 sm:max-w-lg font-light`}
            style={{
              lineHeight: "1.75rem",
            }}
          >
            <h2
              className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
            >
              <IconNote size={24} strokeWidth={2} /> Creating & Saving Notes
            </h2>
            <p>
              Creating a note on{" "}
              <span className={`font-medium`}>JustNoted</span> couldn't be
              easier. When you first load the page, you'll see an empty note
              waiting for your thoughts. Just start typing and, if you need
              another note, just click/tap the big{" "}
              <span
                className={`mx-2 px-2 py-1 inline-flex items-center gap-1 w-fit border rounded-xl font-medium`}
              >
                <IconSquareRoundedPlus stroke={2} /> Add a new note
              </span>{" "}
              button.
            </p>
            <p>
              Your work is automatically saved 2 seconds after you stop typing.
              You'll see a{" "}
              <span className={`mx-2 inline-flex gap-1 w-fit text-neutral-500`}>
                <IconLoader className="animate-spin" />{" "}
                <strong>Saving...</strong>
              </span>{" "}
              indicator followed by a{" "}
              <span
                className={`mx-2 inline-flex items-center gap-1 w-fit text-mercedes-primary`}
              >
                <IconCircleCheck className="text-mercedes-primary" />{" "}
                <strong>Saved</strong>
              </span>{" "}
              confirmation once it's complete.
            </p>
            <p>
              If the auto-save doesn't trigger for some reason, or you just want
              the peace of mind of a manual save, hit the{" "}
              <span
                className={`inline-flex border border-mercedes-primary rounded-md bg-neutral-100 p-1`}
              >
                <IconDeviceFloppy size={20} strokeWidth={2} />
              </span>{" "}
              button anytime.
            </p>

            <h2
              className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
            >
              <IconCloud size={24} strokeWidth={2} /> Local Notes vs Cloud Notes
            </h2>
            <p>
              <span className={`font-medium`}>JustNoted</span> offers two types
              of notes to suit different needs:
            </p>
            <p>
              <span className={`font-semibold`}>Local Notes</span> are perfect
              for quick, anonymous note-taking. They're automatically saved and
              tied to your specific device and browser – no account required.
              These notes will be there when you return, as long as you're using
              the same browser on the same device and haven't cleared your
              browser data. Think of them as your private scratchpad that's
              always ready when you need it.
            </p>
            <p>
              <span className={`font-semibold`}>Cloud Notes</span> require a
              free account but give you the flexibility to access your notes
              from any device or browser. Perfect for notes you want to keep
              long-term or access across multiple devices. Your cloud notes are
              securely tied to your account and sync automatically.
            </p>
            <p>
              Both types save automatically and work exactly the same way – the
              only difference is where they're stored and from where you can
              access them.
            </p>

            <h2
              className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
            >
              <IconEdit size={24} strokeWidth={2} /> Changing the Title of Your
              Note
            </h2>
            <p>
              If you want to change the title of your note, hover over the title
              (on mobile: tap on the title) and then click/tap the{" "}
              <span
                className={`inline-flex bg-neutral-100 rounded-md p-1 text-mercedes-primary`}
              >
                <IconPencil size={20} strokeWidth={2} />
              </span>{" "}
              button. This will let you type in a new title. When you're done,
              just click/tap the{" "}
              <span
                className={`inline-flex rounded-md bg-neutral-100 p-1 text-mercedes-primary`}
              >
                <IconCheck size={20} strokeWidth={2} />
              </span>{" "}
              button to save your changes or click/tap the{" "}
              <span
                className={`inline-flex rounded-md bg-neutral-100 p-1 text-red-700`}
              >
                <IconX size={20} strokeWidth={2} />
              </span>{" "}
              button to cancel your changes.
            </p>

            <h2
              className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
            >
              <IconDownload size={24} strokeWidth={2} /> Downloading Your Notes
            </h2>
            <p>
              Need to take your note elsewhere? Just click/tap the{" "}
              <span
                className={`inline-flex border border-mercedes-primary rounded-md bg-neutral-100 p-1`}
              >
                <IconFileTypeTxt size={20} strokeWidth={2} />
              </span>{" "}
              button to download your note as a simple .txt file. These files
              can be opened on virtually any device, so your thoughts are always
              portable.
            </p>

            <h2
              className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
            >
              <IconTrash size={24} strokeWidth={2} /> Deleting Notes
            </h2>
            <p>
              Once you're done with a note and don't need it anymore, click/tap
              the{" "}
              <span
                className={`inline-flex border border-neutral-800 rounded-md bg-neutral-100 p-1`}
              >
                <IconTrash size={20} strokeWidth={2} />
              </span>{" "}
              button. You'll get a quick confirmation (just to make sure you're
              certain), and then it's gone forever. Really forever – I don't
              keep backups of deleted notes, whether they're local or cloud.
            </p>

            <h2
              className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
            >
              <IconNotebook size={24} strokeWidth={2} /> Organising with
              Notebooks
            </h2>
            <p>
              Look, I know I said{" "}
              <span className={`font-medium`}>JustNoted</span> was meant to be
              simple, and it still is. But sometimes you end up with a lot of
              notes and need a bit of organisation without the fuss. That's
              where notebooks come in.
            </p>
            <p>
              If you have a cloud account, you can create notebooks to group
              your notes together. Working on a novel? Make a notebook for it.
              Got a bunch of work notes? Another notebook. You can even
              customise each notebook with different covers – solid colours,
              gradients, or photos. It's a small thing, but it helps you find
              what you're looking for at a glance.
            </p>
            <p>
              Don't want to use notebooks? That's completely fine. Your notes
              will just live in "All Notes" like they always have. The feature
              is there when you need it, invisible when you don't 🤷‍♂️.
            </p>

            <h2
              className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
            >
              <IconLayoutColumns size={24} strokeWidth={2} /> Split View for
              Referencing Notes
            </h2>
            <p>
              Ever been writing something and needed to check another note? Used
              to be you'd have to scroll up, lose your place, scroll back down,
              forget what you read, scroll up again... you get it. It's
              annoying.
            </p>
            <p>
              Split view fixes that. Click the split view button in the toolbar
              and your screen divides in two – your current note on one side, a
              reference note on the other. You can pick any note to reference,
              resize the panes however you like, and even switch between
              side-by-side or top-and-bottom layouts. When you're done, just
              close it and you're back to normal.
            </p>
            <p>
              Keyboard shortcut:{" "}
              <span className={`font-medium`}>Ctrl+Shift+S</span> (or{" "}
              <span className={`font-medium`}>Cmd+Shift+S</span> on Mac) toggles
              it on and off.
            </p>

            <h2
              className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
            >
              <IconList size={24} strokeWidth={2} /> Table of Contents
            </h2>
            <p>
              If you're writing something longer – maybe an article, a story, or
              just a really detailed plan – the table of contents can help you
              navigate. It automatically picks up any headings you've added to
              your note and lists them in a panel on the right.
            </p>
            <p>
              Click any heading in the list and you'll jump straight to it in
              your note. The current section gets highlighted as you scroll, so
              you always know where you are. It's genuinely useful for longer
              pieces, and completely ignorable for quick notes.
            </p>
            <p>
              Toggle it with the{" "}
              <span
                className={`inline-flex border border-mercedes-primary rounded-md bg-neutral-100 p-1`}
              >
                <IconList size={20} strokeWidth={2} />
              </span>{" "}
              button in the toolbar, or use{" "}
              <span className={`font-medium`}>Ctrl+Shift+T</span>.
            </p>

            <h2
              className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
            >
              <IconCheckbox size={24} strokeWidth={2} /> Bulk Actions
            </h2>
            <p>
              Got a bunch of notes that need to move to a notebook? You don't
              have to do them one by one. In the sidebar, there's a select mode
              that lets you tick multiple notes and move them all at once.
              Select what you need, pick the destination, done.
            </p>

            <h2
              className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
            >
              <IconDownload size={24} strokeWidth={2} /> Exporting Notebooks
            </h2>
            <p>
              Sometimes you need to take your notes somewhere else – maybe
              you're backing up a project, or you want to share a collection
              with someone. When you're viewing a notebook, you'll see an export
              button that lets you download all the notes in that notebook at
              once.
            </p>
            <p>
              You can export as plain text (.txt), Markdown (.md), HTML (for web
              viewing), or JSON (if you're a dev who wants the raw data). Pick
              what works for you.
            </p>

            <h2
              className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
            >
              <IconShieldLock size={24} strokeWidth={2} /> How Your Privacy Is
              Protected
            </h2>
            <p>
              I built <span className={`font-medium`}>JustNoted</span> with
              privacy in mind. For local notes, no information about your
              computer or browser is stored in the database.{" "}
              <span className={`font-medium`}>JustNoted</span> creates a
              randomly generated code that serves as an anonymous token for your
              browser. This token is saved only in your browser. When you return
              to <span className={`font-medium`}>JustNoted</span>, it checks for
              this token to retrieve your notes. (The word "Local" is not an
              indication of where the notes are saved but what type of access
              you need to access them.)
            </p>
            <p>
              <span className={`font-medium`}>JustNoted</span> knows nothing
              about your browser type or device for local notes – none of that
              is tied to your notes. For cloud notes with an account, only your
              email and the notes themselves are stored, nothing more.
            </p>
            <p>
              Both local and cloud notes are stored in separate secure
              databases. Local notes use a privacy-focused approach where your
              device signature never leaves your browser, while cloud notes are
              securely tied to your account credentials.
            </p>
            <p>
              When you delete a note, whether local or cloud, it's permanently
              deleted with no backups kept. Your data is yours, and when you say
              it's gone, it's truly gone.
            </p>
            <p>
              For local notes, it's more likely that{" "}
              <span className={`font-medium`}>JustNoted</span> will create a
              separate randomly-generated token for you (for example, if you
              clear your browser storage or cache) than it is for anyone to ever
              see your notes. This is why cloud notes with an account are
              recommended if you want guaranteed access across devices.
            </p>

            <p>
              If you haven't yet, please check out{" "}
              <Link
                href={"/the-what"}
                className={`hover:px-1 hover:bg-mercedes-primary text-mercedes-primary hover:text-white font-semibold transition-all duration-300 ease-in-out`}
              >
                The What
              </Link>{" "}
              page to learn more about what{" "}
              <span className={`font-medium`}>JustNoted</span> is.
            </p>
          </section>
        </div>
      </main>
      <GlobalFooter />
    </>
  );
}
