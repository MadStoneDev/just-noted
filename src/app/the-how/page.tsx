import Link from "next/link";
import {
  IconCheck,
  IconCircleCheck,
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

export const metadata = {
  title: "The How - Just Noted",
  description:
    "With privacy in mind, Just Noted, the distraction-free note-taking app, saves your notes without stealing any" +
    " private information about yo. Find out how it works.",
};

export default function TheHowPage() {
  return (
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
          Creating a note on <span className={`font-medium`}>JustNoted</span>{" "}
          couldn't be easier. When you first load the page, you'll see an empty
          note waiting for your thoughts. Just start typing. If you need another
          note, just click/tap the big{" "}
          <span
            className={`mx-2 px-2 py-1 inline-flex items-center gap-1 w-fit border rounded-xl font-medium`}
          >
            <IconSquareRoundedPlus stroke={2} /> Add a new note
          </span>{" "}
          button.
        </p>
        <p>
          You will notice that every new note is automatically titled,{" "}
          <span className={`font-semibold`}>Just Noted #1</span> or a different
          number. This isn't random but is incremented by a global counter that
          every user of <span className={`font-medium`}>JustNoted</span>{" "}
          contributes to. The current count was last reset on{" "}
          <span className={`px-2 py-1 border bg-neutral-800 text-neutral-100`}>
            26 March, 2025
          </span>
          .
        </p>
        <p>
          Your work is automatically saved 2 seconds after you stop typing.
          You'll see a{" "}
          <span className={`mx-2 inline-flex gap-1 w-fit text-neutral-500`}>
            <IconLoader className="animate-spin" /> <strong>Saving...</strong>
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
          className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
        >
          <IconEdit size={24} strokeWidth={2} /> Changing the Title of Your Note
        </h2>
        <p>
          If you want to change the title of your note, hover over the title (on
          mobile: tap on the title) and then click/tap the{" "}
          <span
            className={`inline-flex bg-neutral-100 rounded-md p-1 text-mercedes-primary`}
          >
            <IconPencil size={20} strokeWidth={2} />
          </span>{" "}
          button. This will let you type in a new title. When you're done, just
          click/tap the{" "}
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
          button to download your note as a simple .txt file. These files can be
          opened on virtually any device, so your thoughts are always portable.
        </p>

        <h2
          className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
        >
          <IconTrash size={24} strokeWidth={2} /> Deleting Notes
        </h2>
        <p>
          Once you're done with a note and don't need it anymore, click/tap the{" "}
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
          className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
        >
          <IconShieldLock size={24} strokeWidth={2} /> How Your Privacy Is
          Protected
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
