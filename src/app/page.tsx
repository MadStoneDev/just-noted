import JustNotes from "@/components/just-notes";

export const metadata = {
  title: "Just Noted - Distraction-Free Note Taking",
  description:
    "Just Noted: Where ideas flow freely. No formatting distractions, just pure writing with offline/online saving and word tools.",
};

export default function Home() {
  return (
    <>
      <JustNotes />
      <footer
        className={`row-start-3 flex gap-[24px] flex-wrap items-center justify-center`}
      ></footer>
    </>
  );
}
