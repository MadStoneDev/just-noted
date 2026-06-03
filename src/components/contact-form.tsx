"use client";

import { useState, useRef, FormEvent } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { submitContactForm } from "@/app/actions/contactActions";
import { IconCheck } from "@tabler/icons-react";

export default function ContactForm() {
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recaptchaRef = useRef<ReCAPTCHA>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const recaptchaToken = await recaptchaRef.current?.executeAsync();
      if (!recaptchaToken) throw new Error("reCAPTCHA verification failed");

      const result = await submitContactForm({ ...formData, recaptchaToken });
      if (result.success) {
        setSuccess(true);
        setFormData({ name: "", email: "", message: "" });
      } else {
        setError(result.error || "Something went wrong.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      recaptchaRef.current?.reset();
    }
  };

  const inputClass = "w-full h-10 px-3 text-sm bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[var(--color-accent-subtle)] focus:outline-none transition-colors";

  if (success) {
    return (
      <div className="mt-8 flex flex-col items-center gap-3 text-center">
        <div className="w-10 h-10 rounded-full bg-[var(--color-success-subtle)] flex items-center justify-center">
          <IconCheck size={20} className="text-[var(--color-success)]" />
        </div>
        <p className="text-sm text-[var(--color-text-primary)] font-medium">Message sent</p>
        <p className="text-xs text-[var(--color-text-secondary)]">We'll get back to you soon.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-3 text-left">
      <input
        type="text"
        name="name"
        value={formData.name}
        onChange={handleChange}
        className={inputClass}
        placeholder="Name (optional)"
      />
      <input
        type="email"
        name="email"
        value={formData.email}
        onChange={handleChange}
        required
        className={inputClass}
        placeholder="Email"
      />
      <textarea
        name="message"
        value={formData.message}
        onChange={handleChange}
        required
        className={`${inputClass} min-h-[120px] h-auto py-2 resize-y`}
        placeholder="Message"
      />

      <ReCAPTCHA
        ref={recaptchaRef}
        sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || ""}
        size="invisible"
        badge="bottomright"
      />

      {error && (
        <p className="text-xs text-[var(--color-danger)]">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className={`w-full h-10 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--color-accent)] text-[var(--color-text-on-accent)] hover:bg-[var(--color-accent-hover)] transition-colors ${
          loading ? "opacity-60" : ""
        }`}
      >
        {loading ? "Sending..." : "Send Message"}
      </button>
    </form>
  );
}
