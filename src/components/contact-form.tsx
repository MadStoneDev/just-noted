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
          className={`my-6 p-4 bg-mercedes-primary/10 text-mercedes-primary rounded mb-4`}
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
            className={`p-3 bg-neutral-100/70 focus:bg-neutral-50 focus:outline-none transition-all duration-300 ease-in-out`}
            placeholder={`Name (optional)`}
          />

          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className={`p-3 bg-neutral-100/70 focus:bg-neutral-50 focus:outline-none transition-all duration-300 ease-in-out`}
            placeholder={`Email`}
          />

          <textarea
            name="message"
            value={formData.message}
            onChange={handleChange}
            required
            className={`p-3 bg-neutral-100/70 focus:bg-neutral-50 min-h-[150px] focus:outline-none transition-all duration-300 ease-in-out`}
            placeholder={`Message`}
          />

          <ReCAPTCHA
            ref={recaptchaRef}
            size="invisible"
            sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || ""}
          />

          {error && <div className={`text-red-700 text-sm`}>{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className={`cursor-pointer p-3 bg-mercedes-primary hover:bg-mercedes-primary/70 focus:bg-mercedes-primary/70 text-neutral-50 outline-none font-medium transition-all duration-300 ease-in-out ${
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
