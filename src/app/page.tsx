import JustNotes from "@/components/just-notes";

export const metadata = {
  title: "Just Noted - Distraction-Free Note Taking",
  description:
    "Just Noted: Where ideas flow freely. No formatting distractions, just pure writing with offline/online saving and word tools.",
};

export default function Home() {
  return (
    <main className={`px-4 sm:px-8 w-full min-h-screen overflow-hidden`}>
      <JustNotes />
      <footer
        className={`row-start-3 flex gap-[24px] flex-wrap items-center justify-center`}
      ></footer>
    </main>
  );
}
