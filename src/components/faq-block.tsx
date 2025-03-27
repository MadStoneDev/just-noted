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
          Absolutely not! That's one of the core principles behind JustNoted.
          You don't need to sign up, register, or create any kind of account.
          Just visit the website and start typing right away.
        </p>
      ),
    },
    {
      question: "Can I edit the same notes on multiple devices?",
      answer: (
        <p>
          Currently, no. JustNoted is designed for quick, temporary notes
          without the dependency on logins and registrations. Your notes are
          stored locally on the device and browser you're using, so they won't
          sync across different devices or browsers.
        </p>
      ),
    },
    {
      question: "How do my notes get saved?",
      answer: (
        <p>
          Your notes are automatically saved in your browser's local storage. As
          long as you keep editing your notes on the same device and browser
          (and don't use incognito mode), they'll stay right where you left them
          when you come back. For more details on how this works, check out{" "}
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
      question: "Are there any limitations on how much I can write?",
      answer: (
        <p>
          JustNoted lets you create unlimited notes without any restrictions.
          For typical note-taking needs, you won't run into any issues.
        </p>
      ),
    },
    {
      question: "Is my data private and secure?",
      answer: (
        <p>
          Your notes are stored securely and tied with an anonymous
          randomly-generated token. JustNoted was designed with privacy in mind
          - no tracking, no data collection, just a simple notepad. For more
          information about how your data is handled, please visit{" "}
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
          If you clear your browser data, including local storage, your notes
          will be lost. JustNoted is designed for temporary notes rather than
          permanent storage. If you have important information, it's best to
          copy it somewhere else for long-term keeping.
        </p>
      ),
    },
    {
      question: "Can I format my text or add images?",
      answer: (
        <p>
          JustNoted is intentionally minimalist, focusing on distraction-free
          plain text note-taking. Currently, it doesn't support rich text
          formatting or image embedding. This keeps the interface clean and the
          app fast and simple.
        </p>
      ),
    },
  ];

  return (
    <div className="my-10 pt-3 sm:text-center">
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

        <div className="mt-8 pt-4 border-t border-gray-200 font-light text-center">
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
