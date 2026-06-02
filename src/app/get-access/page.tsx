"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { handleAuth, verifyOtp } from "./actions";
import { IconArrowLeft, IconMail } from "@tabler/icons-react";

export default function GetAccessPage() {
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [activeInput, setActiveInput] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const router = useRouter();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const formData = new FormData();
    formData.append("email", email);

    try {
      const result = await handleAuth(formData);
      if (result.success) {
        setOtpSent(true);
        setCountdown(60);
      } else {
        setError(result.error);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value && !/^\d*$/.test(value)) return;

    const newOtp = [...otp];

    if (value.length > 1) {
      const pastedValues = value.slice(0, 6).split("");
      for (let i = 0; i < pastedValues.length; i++) {
        if (i + index < 6) newOtp[i + index] = pastedValues[i];
      }
      const nextEmptyIndex = newOtp.findIndex((digit) => digit === "");
      setOtp(newOtp);
      setTimeout(() => {
        const nextIndex = nextEmptyIndex !== -1 ? nextEmptyIndex : 5;
        setActiveInput(nextIndex);
        inputRefs.current[nextIndex]?.focus();
      }, 0);
      if (newOtp.every((digit) => digit !== "")) {
        setTimeout(() => handleOtpSubmit(newOtp.join("")), 300);
      }
    } else {
      newOtp[index] = value;
      setOtp(newOtp);
      if (value !== "" && index < 5) {
        const nextIndex = index + 1;
        setTimeout(() => {
          setActiveInput(nextIndex);
          inputRefs.current[nextIndex]?.focus();
        }, 0);
      }
      if (index === 5 && value && newOtp.every((digit) => digit !== "")) {
        setTimeout(() => handleOtpSubmit(newOtp.join("")), 300);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace") {
      if (!otp[index]) {
        if (index > 0) {
          const prevIndex = index - 1;
          setTimeout(() => {
            setActiveInput(prevIndex);
            inputRefs.current[prevIndex]?.focus();
          }, 0);
        }
      } else {
        const newOtp = [...otp];
        newOtp[index] = "";
        setOtp(newOtp);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      setTimeout(() => {
        setActiveInput(index - 1);
        inputRefs.current[index - 1]?.focus();
      }, 0);
    } else if (e.key === "ArrowRight" && index < 5) {
      setTimeout(() => {
        setActiveInput(index + 1);
        inputRefs.current[index + 1]?.focus();
      }, 0);
    }
  };

  const handleOtpSubmit = async (otpValue: string) => {
    setError(null);
    setIsLoading(true);
    setIsVerifying(true);

    const formData = new FormData();
    formData.append("email", email);
    formData.append("otp", otpValue);

    try {
      const result = await verifyOtp(formData);
      if (result.success) {
        router.push(result.redirectTo || "/");
      } else {
        setError(result.error);
      }
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setIsLoading(false);
      setIsVerifying(false);
    }
  };

  const requestNewCode = async () => {
    if (countdown > 0) return;
    setError(null);
    setIsLoading(true);

    const formData = new FormData();
    formData.append("email", email);

    try {
      const result = await handleAuth(formData);
      if (result.success) {
        setCountdown(60);
        setOtp(["", "", "", "", "", ""]);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Failed to send a new code.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (otpSent && inputRefs.current[0]) {
      setTimeout(() => inputRefs.current[0]?.focus(), 0);
    }
  }, [otpSent]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-sm w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-accent-subtle)] mb-4">
            <IconMail size={22} className="text-[var(--color-accent)]" />
          </div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {otpSent ? "Check your email" : "Get started"}
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)] leading-relaxed">
            {otpSent
              ? `We sent a 6-digit code to ${email}`
              : "Sign in or create an account with your email"}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-3 py-2.5 text-sm text-[var(--color-danger)] bg-[var(--color-danger-subtle)] border-l-2 border-[var(--color-danger)] rounded-[var(--radius-md)]">
            {error}
          </div>
        )}

        {otpSent ? (
          <div className="space-y-6">
            {/* OTP inputs */}
            <div className="flex justify-center gap-2 sm:gap-3">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputRefs.current[index] = el;
                    return undefined;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  maxLength={6}
                  className="w-10 h-12 sm:w-11 sm:h-13 text-center text-lg font-medium border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[var(--color-accent-subtle)] focus:outline-none transition-colors duration-[var(--duration-fast)]"
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onFocus={() => setActiveInput(index)}
                  disabled={isLoading || isVerifying}
                />
              ))}
            </div>

            {/* Status */}
            <div className="text-center">
              {isVerifying ? (
                <div className="flex items-center justify-center gap-2 text-sm text-[var(--color-accent)]">
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Verifying...
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isLoading || countdown > 0}
                  onClick={requestNewCode}
                  className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition-colors disabled:opacity-50"
                >
                  {countdown > 0
                    ? `Resend code in ${countdown}s`
                    : "Didn't get a code? Resend"}
                </button>
              )}
            </div>

            {/* Back */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setOtp(["", "", "", "", "", ""]);
                  setError(null);
                }}
                disabled={isVerifying}
                className="inline-flex items-center gap-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                <IconArrowLeft size={12} />
                Different email
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full h-11 px-3 text-sm border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[var(--color-accent-subtle)] focus:outline-none transition-colors duration-[var(--duration-fast)]"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full h-11 flex items-center justify-center text-sm font-medium rounded-[var(--radius-md)] bg-[var(--color-accent)] text-[var(--color-text-on-accent)] hover:bg-[var(--color-accent-hover)] transition-colors duration-[var(--duration-fast)] ${
                isLoading ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              {isLoading ? "Sending..." : "Continue with Email"}
            </button>

            <div className="text-center">
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                <IconArrowLeft size={12} />
                Back to JustNoted
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
