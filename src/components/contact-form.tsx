"use client";

import { useState, useRef, FormEvent } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { submitContactForm } from "@/app/actions/contactActions";

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

  if (success) {
    return (
      <div className="mt-12 text-center">
        <p className="text-sm text-[var(--color-text-primary)]">Sent. We'll be in touch.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 space-y-6 text-left">
      <div>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="Your name"
          className="w-full bg-transparent border-none border-b border-[var(--color-border-secondary)] pb-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          style={{ borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--color-border-secondary)" }}
          onFocus={(e) => e.target.style.borderBottomColor = "var(--color-accent)"}
          onBlur={(e) => e.target.style.borderBottomColor = "var(--color-border-secondary)"}
        />
      </div>

      <div>
        <input
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          required
          placeholder="your@email.com"
          className="w-full bg-transparent border-none pb-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none transition-colors"
          style={{ borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--color-border-secondary)" }}
          onFocus={(e) => e.target.style.borderBottomColor = "var(--color-accent)"}
          onBlur={(e) => e.target.style.borderBottomColor = "var(--color-border-secondary)"}
        />
      </div>

      <div>
        <textarea
          name="message"
          value={formData.message}
          onChange={handleChange}
          required
          placeholder="What's on your mind?"
          rows={4}
          className="w-full bg-transparent border-none pb-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none resize-none leading-relaxed transition-colors"
          style={{ borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--color-border-secondary)" }}
          onFocus={(e) => e.target.style.borderBottomColor = "var(--color-accent)"}
          onBlur={(e) => e.target.style.borderBottomColor = "var(--color-border-secondary)"}
        />
      </div>

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
        className={`text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors ${
          loading ? "opacity-50" : ""
        }`}
      >
        {loading ? "Sending..." : "Send →"}
      </button>
    </form>
  );
}
