import Link from "next/link";
import {
  IconShieldLock,
  IconUserCircle,
  IconCookie,
  IconAnalyze,
  IconMail,
  IconBallpen,
  IconRosetteDiscountCheck,
} from "@tabler/icons-react";

export const metadata = {
  title: "Privacy Policy - Just Noted",
  description:
    "Our commitment to protecting your privacy. Just Noted takes your privacy seriously and ensures your notes remain private and secure.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className={`pt-3`}>
      <h1 className={`text-xl font-semibold sm:text-center`}>
        Privacy Policy for{" "}
        <span className={`p-1 bg-mercedes-primary font-secondary`}>
          Just
          <span className={`text-white`}>Noted</span>
        </span>
      </h1>

      <section
        className={`sm:mx-auto mt-5 flex flex-col gap-6 sm:max-w-lg font-light`}
        style={{
          lineHeight: "1.75rem",
        }}
      >
        <p className={`sm:text-center`}>
          <span className={`font-medium`}>Last updated:</span> March 26, 2025
        </p>

        <h2
          className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
        >
          <IconRosetteDiscountCheck size={24} strokeWidth={2} /> Our Commitment
          to Privacy
        </h2>
        <p>
          At <span className={`font-medium`}>JustNoted</span>, we take your
          privacy seriously. This policy outlines what information we collect,
          how we use it, and the steps we take to ensure your data remains
          private and secure.
        </p>
        <p>
          We built <span className={`font-medium`}>JustNoted</span> with privacy
          as a core principle. Our goal is to provide a distraction-free
          note-taking experience without compromising your privacy.
        </p>

        <h2
          className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
        >
          <IconUserCircle size={24} strokeWidth={2} /> Personal Information
        </h2>
        <p>
          <span className={`font-medium`}>JustNoted</span> does not collect any
          personal information about you. We don't ask for your name, email
          address, or any other identifiable information to use our service.
        </p>
        <p>
          When you create notes, they are associated with a randomly generated
          anonymous token stored only in your browser's LocalStorage. We have no
          way to connect this token to you personally.
        </p>
        <p>
          We do not track or store information about your device, browser type,
          operating system, or IP address in relation to your notes or usage of
          our service.
        </p>

        <h2
          className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
        >
          <IconShieldLock size={24} strokeWidth={2} /> Your Notes and Data
        </h2>
        <p>
          The content of your notes is stored securely and is only accessible
          through your browser using the anonymous token created for you. We do
          not read, analyze, or process your note content.
        </p>
        <p>
          When you delete a note, it is permanently deleted from our servers. We
          do not keep backups of deleted notes.
        </p>
        <p>
          If you clear your browser's cache or LocalStorage, your anonymous
          token will be lost, and you will receive a new one upon your next
          visit. This means your previous notes will no longer be accessible.
        </p>

        <h2
          className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
        >
          <IconAnalyze size={24} strokeWidth={2} /> Analytics
        </h2>
        <p>
          We use Google Analytics to collect anonymous usage data that helps us
          improve our service. This data includes information about how visitors
          use our site, such as the pages they visit and how long they stay.
        </p>
        <p>
          The analytics data is aggregated and does not contain any personally
          identifiable information. We cannot and do not connect this data to
          your notes or your anonymous token.
        </p>
        <p>
          We use this information solely to understand usage patterns and
          improve <span className={`font-medium`}>JustNoted</span>'s features
          and usability.
        </p>

        <h2
          className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
        >
          <IconCookie size={24} strokeWidth={2} /> Cookies
        </h2>
        <p>
          <span className={`font-medium`}>JustNoted</span> uses only essential
          cookies and LocalStorage to maintain your session and store your
          anonymous token. We do not use tracking cookies or third-party cookies
          for advertising purposes.
        </p>
        <p>
          Google Analytics uses cookies to collect usage data. You can opt-out
          of Google Analytics by using browser extensions or plugins designed
          for this purpose.
        </p>

        <h2
          className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
        >
          <IconBallpen size={24} strokeWidth={2} /> Changes to This Policy
        </h2>
        <p>
          We may update this privacy policy from time to time. When we do, we'll
          revise the "Last updated" date at the top of this page. We encourage
          you to periodically review this privacy policy to stay informed about
          how we are protecting your information.
        </p>

        <h2
          className={`mt-3 pb-2 border-b border-neutral-400 font-secondary font-semibold text-lg flex items-center gap-2`}
        >
          <IconMail size={24} strokeWidth={2} /> Contact Us
        </h2>
        <p>
          If you have any questions or concerns about our privacy policy or
          practices, please don't hesitate to reach out to us through our{" "}
          <Link
            href={"/contact"}
            className={`hover:px-1 hover:bg-mercedes-primary text-mercedes-primary hover:text-white font-semibold transition-all duration-300 ease-in-out`}
          >
            Contact Page
          </Link>
          .
        </p>

        <p className="mt-4">
          Thank you for trusting{" "}
          <span className={`font-medium`}>JustNoted</span> with your notes.
        </p>
      </section>
    </div>
  );
}
