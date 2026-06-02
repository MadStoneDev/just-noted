"use client";

import { useState, useRef, FormEvent } from "react";
import ReCAPTCHA from "react-google-recaptcha";

import { submitContactForm } from "@/app/actions/contactActions";

export default function ContactForm() {
  // States
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ReCAPTCHA reference
  const recaptchaRef = useRef<ReCAPTCHA>(null);

  // Handle input changes
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Handle form submission
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Get reCAPTCHA token
      const recaptchaToken = await recaptchaRef.current?.executeAsync();
      if (!recaptchaToken) {
        throw new Error("reCAPTCHA verification failed");
      }

      // Submit form
      const result = await submitContactForm({
        ...formData,
        recaptchaToken,
      });

      if (result.success) {
        setSuccess(true);
        setFormData({ name: "", email: "", message: "" });
      } else {
        setError(result.error || "Something went wrong. Please try again.");
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
      console.error("Form submission error:", err);
    } finally {
      setLoading(false);
      recaptchaRef.current?.reset();
    }
  };

  return (
    <div className={`mt-8 mx-auto max-w-lg`}>
      {success ? (
        <div
          className={`my-6 p-4 bg-[var(--color-accent)]/10 text-[var(--color-accent)] rounded mb-4`}
        >
          Thank you for your message! We'll get back to you soon.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className={`my-6 grid gap-5 font-light`}>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className={`p-3 bg-[var(--color-bg-tertiary)]/70 focus:bg-[var(--color-bg-secondary)] focus:outline-none transition-all duration-300 ease-in-out`}
            placeholder={`Name (optional)`}
          />

          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className={`p-3 bg-[var(--color-bg-tertiary)]/70 focus:bg-[var(--color-bg-secondary)] focus:outline-none transition-all duration-300 ease-in-out`}
            placeholder={`Email`}
          />

          <textarea
            name="message"
            value={formData.message}
            onChange={handleChange}
            required
            className={`p-3 bg-[var(--color-bg-tertiary)]/70 focus:bg-[var(--color-bg-secondary)] min-h-[150px] focus:outline-none transition-all duration-300 ease-in-out`}
            placeholder={`Message`}
          />

          <ReCAPTCHA
            ref={recaptchaRef}
            sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || ""}
            badge={"bottomright"}
          />

          {error && <div className={`text-[var(--color-danger)] text-sm`}>{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className={`cursor-pointer p-3 bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/70 focus:bg-[var(--color-accent)]/70 text-[var(--color-text-inverse)] outline-none font-medium transition-all duration-300 ease-in-out ${
              loading ? "opacity-70 cursor-not-allowed" : ""
            }`}
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </form>
      )}
    </div>
  );
}
