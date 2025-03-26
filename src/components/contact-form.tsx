"use client";

import { useState } from "react";

export default function ContactForm() {
  // States
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });

  return (
    <form className={`my-6 grid gap-5 font-light`}>
      <input
        type="text"
        className={`p-3 bg-neutral-100/70 focus:bg-neutral-50 focus:outline-none transition-all duration-300 ease-in-out`}
        placeholder={`Name (optional)`}
      />

      <input
        type="email"
        className={`p-3 bg-neutral-100/70 focus:bg-neutral-50 focus:outline-none transition-all duration-300 ease-in-out`}
        placeholder={`Email`}
      />

      <textarea
        className={`p-3 bg-neutral-100/70 focus:bg-neutral-50 min-h-[150px] focus:outline-none transition-all duration-300 ease-in-out`}
        placeholder={`Message`}
      />

      <button
        type={`submit`}
        className={`cursor-pointer p-3 bg-mercedes-primary hover:bg-mercedes-primary/70 focus:bg-mercedes-primary/70 text-neutral-50 outline-none font-medium transition-all duration-300 ease-in-out`}
      >
        Send
      </button>
    </form>
  );
}
