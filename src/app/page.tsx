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

      <FaqBlock />
    </>
  );
}
