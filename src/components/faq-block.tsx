"use client";

import Link from "next/link";
import { FAQItem } from "@/components/faq-item";

export default function FaqBlock() {
  const faqs = [
    {
      question: "Does JustNoted cost money?",
      answer: (
        <p>
          No, JustNoted is completely free to use. There are no hidden fees,
          premium features, or subscription plans. It's a simple, free tool
          designed to make note-taking as straightforward as possible.
        </p>
      ),
    },
    {
      question: "Do I need to create an account or subscribe?",
      answer: (
        <p>
          No, that's actually one of the core principles behind JustNoted. You
          don't need to sign up, register, or create any account in order to use
          JustNoted.
        </p>
      ),
    },
    {
      question: "Can I edit the same notes on multiple devices?",
      answer: (
        <p>
          Yes, but bear in mind that, in order to edit the same notes on
          multiple devices, you will need to create a free account. Without an
          account, your notes are stored securely and tied to the device and
          browser you're using, so they won't sync across different devices or
          browsers.
        </p>
      ),
    },
    {
      question: "How do my notes get saved?",
      answer: (
        <p>
          There are two types of notes in JustNoted. Local and Cloud. Cloud
          notes are only available for those with an account. Local notes are
          automatically saved in a secure database, and tied to your device and
          browser signature - think of it like a fingerprint. These notes will
          be readily available as long as you keep editing your notes on the
          same device and browser (and don't use incognito mode). For more
          details on how this works, check out{" "}
          <Link
            href={"/the-how"}
            className={`hover:px-1 hover:bg-mercedes-primary text-mercedes-primary hover:text-white font-semibold transition-all duration-300 ease-in-out`}
          >
            The How
          </Link>{" "}
          page. Cloud notes are also automatically saved in a separate secure
          database, and these are tied to your account so that you can take them
          with you to any device and/or browser.
        </p>
      ),
    },
    {
      question: "Are there any limitations on how much I can write?",
      answer: (
        <p>
          JustNoted lets you create unlimited notes without any restrictions.
        </p>
      ),
    },
    {
      question: "Is my data private and secure?",
      answer: (
        <p>
          Your notes are stored securely in two separate databases, one for
          local notes and another for cloud notes. For more information about
          how your data is handled, please visit{" "}
          <Link
            href={"/the-how"}
            className={`hover:px-1 hover:bg-mercedes-primary text-mercedes-primary hover:text-white font-semibold transition-all duration-300 ease-in-out`}
          >
            The How
          </Link>{" "}
          page.
        </p>
      ),
    },
    {
      question: "What happens if I clear my browser data?",
      answer: (
        <p>
          If you clear your browser data, including local storage, you will wipe
          the signature created for your browser and device which is used to
          retrieve your notes. If this happens, please get in touch with us so
          we can help you regain your notes. Cloud notes will not be affected by
          clearing your browser data.
        </p>
      ),
    },
    {
      question: "Can I format my text or add images?",
      answer: (
        <p>
          JustNoted is intentionally minimalist, focusing on distraction-free
          plain text note-taking. You have some basic options for formatting.
          Image embedding is not a feature possible in JustNoted and nor is it
          currently on our radar either.
        </p>
      ),
    },
  ];

  return (
    <div className="my-10 pt-3 px-3 sm:text-center">
      <h2 className="text-xl font-semibold">
        <span className="p-1 bg-mercedes-primary font-secondary">
          Just<span className="text-white">Noted</span>
        </span>{" "}
        FAQs
      </h2>

      <div className="sm:mx-auto mt-8 sm:max-w-lg">
        {faqs.map((faq, index) => (
          <FAQItem key={index} question={faq.question} answer={faq.answer} />
        ))}

        <div className="mt-8 pt-4 border-t border-neutral-200 font-light text-center">
          <p>
            For all other information, please visit{" "}
            <Link
              href={"/the-what"}
              className={`hover:px-1 hover:bg-mercedes-primary text-mercedes-primary hover:text-white font-semibold transition-all duration-300 ease-in-out`}
            >
              The What
            </Link>{" "}
            and{" "}
            <Link
              href={"/the-how"}
              className={`hover:px-1 hover:bg-mercedes-primary text-mercedes-primary hover:text-white font-semibold transition-all duration-300 ease-in-out`}
            >
              The How
            </Link>{" "}
            pages, or{" "}
            <Link
              href={"/contact"}
              className={`hover:px-1 hover:bg-mercedes-primary text-mercedes-primary hover:text-white font-semibold transition-all duration-300 ease-in-out`}
            >
              contact us
            </Link>{" "}
            with your questions.
          </p>
        </div>
      </div>
    </div>
  );
}
