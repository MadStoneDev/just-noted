import JustNotes from "@/components/just-notes";
import FaqBlock from "@/components/faq-block";

export const metadata = {
  title: "Just Noted - Distraction-Free Note Taking",
  description:
    "Just Noted: Where ideas flow freely. No formatting distractions, just pure writing with offline/online saving and word tools.",
};

export default function Home() {
  return (
    <>
      <JustNotes />

      <h1
        className={`px-3 md:px-0 mt-6 mx-auto max-w-60 md:max-w-full font-secondary text-xl font-semibold text-center`}
      >
        The Distraction-Free Note Taking Platform
      </h1>
      <FaqBlock />
    </>
  );
}
