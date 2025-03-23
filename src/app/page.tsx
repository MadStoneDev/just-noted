import NoteBlock from "@/components/note-block";

export const metadata = {
  title: "Just Noted - ",
  description: "Home page of the application",
};

export default function Home() {
  return (
    <div className={`p-8 w-full min-h-screen`}>
      <main className={`grid grid-cols-12 gap-4`}>
        <NoteBlock />
      </main>
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center"></footer>
    </div>
  );
}
