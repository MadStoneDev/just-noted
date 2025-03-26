import Link from "next/link";

export const metadata = {
  title: "The What - Just Noted",
  description:
    "Just Noted in a nutshell, is a simple distraction-free note-taking app that's easy to use and doesn't require" +
    " any sign-up or registration.",
};

export default function TheWhatPage() {
  return (
    <div className={`pt-3 sm:text-center`}>
      <h1 className={`text-xl font-semibold`}>
        What is{" "}
        <span className={`p-1 bg-mercedes-primary font-secondary`}>
          Just
          <span className={`text-white`}>Noted</span>
        </span>
        ?
      </h1>

      <section
        className={`sm:mx-auto mt-8 flex flex-col gap-6 sm:max-w-lg font-light`}
        style={{
          lineHeight: "1.75rem",
        }}
      >
        <p>
          I could probably summarise everything below with this one sentence:{" "}
          <span className={`font-medium`}>JustNoted</span> is my solution for
          distraction-free note taking.
        </p>
        <p>
          That's it 🤷‍♂️. That's why I made{" "}
          <span className={`font-medium`}>JustNoted</span>, but if you're
          looking for a bit more detail then, by all means, please read on.
        </p>
        <p>
          I created <span className={`font-medium`}>JustNoted</span> because I
          was constantly frustrated with the lack of simple note-taking options
          out there. Hear me out, I know there are a million and one different
          note-taking apps and websites but not like what I was looking for. I
          wanted something that just works – you visit the page and immediately
          start typing. No messing around with logins, no waiting for pages to
          load, none of that stuff that gets in the way when you just need to
          write something down quickly.
        </p>
        <p>
          With <span className={`font-medium`}>JustNoted</span>, I made sure to
          include the features that actually matter. You can see your word and
          character counts as you type, and, best of all, create unlimited notes
          without any restrictions. Your notes stay right where you left them
          when you come back on the same device and browser (just don't use
          incognito mode). As long as you keep editing your notes, any of them,
          they remain saved. If you're wondering how I made this work, or you're
          worried about your privacy, check out{" "}
          <Link
            href={"/the-how"}
            className={`hover:px-1 hover:bg-mercedes-primary text-mercedes-primary hover:text-white font-semibold transition-all duration-300 ease-in-out`}
          >
            The How
          </Link>
          .
        </p>
        <p>
          <span className={`font-medium`}>JustNoted</span> came out of a genuine
          every day need. I couldn't access notepad on all my devices, but I
          constantly needed somewhere to quickly type phone numbers, temporary
          passwords, or notes while on calls. I needed a space to brainstorm
          ideas or draft social media posts without committing them to permanent
          storage somewhere. I just wanted a place where my thoughts could live
          temporarily until I was ready to move them elsewhere or delete them.
        </p>
        <p>
          I looked everywhere for something this straightforward that wouldn't
          force me to create an account or pay for features I didn't need 🙄.
          When I couldn't find it, I decided to build it myself. That's how{" "}
          <span className={`font-medium`}>JustNoted</span> was born – my answer
          to overcomplicated note-taking apps.
        </p>
        <p>
          Do you have any ideas of how I can improve{" "}
          <span className={`font-medium`}>JustNoted</span>? Are you saying it's
          not perfect? 🤨 Yeah, fair enough 😆. Alright, shoot me an email and
          let me know your ideas. I would love for this project to serve as many
          people as possible while remaining simple and intuitive 🙌.
        </p>
      </section>
    </div>
  );
}
