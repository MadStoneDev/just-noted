﻿import Link from "next/link";
import {
  IconCircleCheck,
  IconDeviceFloppy,
  IconFileTypeTxt,
  IconLoader,
  IconTrash,
} from "@tabler/icons-react";

export const metadata = {
  title: "The How - Just Noted",
  description:
    "With privacy in mind, Just Noted, the distraction-free note-taking app, saves your notes without stealing any" +
    " private information about yo. Find out how it works.",
};

export default function TheHowPage() {
  return (
    <div className={`pt-3 sm:text-center`}>
      <h1 className={`text-xl font-semibold`}>
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
          className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg`}
        >
          Creating & Saving Notes
        </h2>
        <p>
          Creating a note on <span className={`font-medium`}>JustNoted</span>{" "}
          couldn't be easier. When you first load the page, you'll see an empty
          note waiting for your thoughts. Just start typing.
        </p>
        <p>
          Your work is automatically saved 2 seconds after you stop typing.
          You'll see a{" "}
          <span className={`py-1 flex gap-1 text-neutral-500`}>
            <IconLoader className="animate-spin" /> <strong>Saving...</strong>
          </span>{" "}
          indicator followed by a{" "}
          <span
            className={`py-1 flex items-center gap-1 text-mercedes-primary`}
          >
            <IconCircleCheck className="text-mercedes-primary" />{" "}
            <strong>Saved</strong>
          </span>{" "}
          confirmation once it's complete.
        </p>
        <p>
          If the auto-save doesn't trigger for some reason, or you just want the
          peace of mind of a manual save, hit the{" "}
          <span
            className={`inline-flex border border-mercedes-primary rounded-md bg-neutral-100 p-1`}
          >
            <IconDeviceFloppy size={20} strokeWidth={2} />
          </span>{" "}
          button anytime.
        </p>

        <h2
          className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg`}
        >
          Downloading Your Notes
        </h2>
        <p>
          Need to take your note elsewhere? Just click the{" "}
          <span
            className={`inline-flex border border-mercedes-primary rounded-md bg-neutral-100 p-1`}
          >
            <IconFileTypeTxt size={20} strokeWidth={2} />
          </span>{" "}
          button to download your note as a simple .txt file. These files can be
          opened on virtually any device, so your thoughts are always portable.
        </p>

        <h2
          className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg`}
        >
          Deleting Notes
        </h2>
        <p>
          Once you're done with a note and don't need it anymore, click the{" "}
          <span
            className={`inline-flex border border-neutral-800 rounded-md bg-neutral-100 p-1`}
          >
            <IconTrash size={20} strokeWidth={2} />
          </span>{" "}
          button. You'll get a quick confirmation (just to make sure you're
          certain), and then it's gone forever. Really forever – I don't keep
          backups.
        </p>

        <h2
          className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg`}
        >
          How Your Privacy Is Protected
        </h2>
        <p>
          I built <span className={`font-medium`}>JustNoted</span> with privacy
          in mind. No information about your computer or browser is stored
          anywhere. <span className={`font-medium`}>JustNoted</span> creates a
          randomly generated code that serves as an anonymous token for your
          browser. This token is saved only in your browser's LocalStorage. When
          you return to <span className={`font-medium`}>JustNoted</span>, it
          checks for this token to retrieve your notes.
        </p>
        <p>
          <span className={`font-medium`}>JustNoted</span> knows nothing about
          your browser type or device – none of that is tied to your notes. When
          you delete a note, it's permanently deleted with no backups kept.
        </p>
        <p>
          In fact, it's more likely that{" "}
          <span className={`font-medium`}>JustNoted</span> will create a
          separate randomly-generated token for you (for example, if you clear
          your browser storage or cache) than it is for anyone to ever see your
          notes.
        </p>
        <p>
          This approach means your notes remain private while still being there
          when you need them – as long as you're using the same browser on the
          same device and haven't cleared your cache.
        </p>

        <p>
          If you haven't yet found, please check out{" "}
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
  );
}
