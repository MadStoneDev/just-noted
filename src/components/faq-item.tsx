"use client";

import { ReactNode, useState } from "react";

export const FAQItem = ({
  question,
  answer,
}: {
  question: string;
  answer: ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-gray-200 py-2">
      <button
        className={`p-2 flex w-full justify-between items-center ${
          isOpen && "bg-mercedes-primary"
        } hover:bg-mercedes-primary text-left font-medium focus:outline-none transition-all duration-300 ease-in-out`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{question}</span>
        <svg
          className={`w-5 h-5 transition-transform duration-300 ${
            isOpen ? "transform rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? "max-h-[999px] pt-4" : "max-h-0"
        }`}
      >
        <div
          className={`p-2 bg-neutral-100 font-light`}
          style={{ lineHeight: "1.75rem" }}
        >
          {answer}
        </div>
      </div>
    </div>
  );
};
