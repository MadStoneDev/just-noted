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
  IconPencil,
  IconShieldLock,
  IconSquareRoundedPlus,
  IconTrash,
  IconX,
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
