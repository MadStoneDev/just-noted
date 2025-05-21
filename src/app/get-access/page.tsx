"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { handleAuth, verifyOtp } from "./actions";

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
        setCountdown(60); // 60 second cooldown for requesting another code
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d*$/.test(value)) return;

    const newOtp = [...otp];

    // Handle paste event (could be full OTP)
    if (value.length > 1) {
      const pastedValues = value.slice(0, 6).split("");
      for (let i = 0; i < pastedValues.length; i++) {
        if (i + index < 6) {
          newOtp[i + index] = pastedValues[i];
        }
      }

      // Find next empty slot or move to the end
      const nextEmptyIndex = newOtp.findIndex((digit) => digit === "");
      setOtp(newOtp);

      // Update active input after otp state is set
      setTimeout(() => {
        const nextIndex = nextEmptyIndex !== -1 ? nextEmptyIndex : 5;
        setActiveInput(nextIndex);
        inputRefs.current[nextIndex]?.focus();
      }, 0);

      // If all fields are filled, submit automatically
      if (newOtp.every((digit) => digit !== "")) {
        setTimeout(() => {
          handleOtpSubmit(newOtp.join(""));
        }, 300);
      }
    } else {
      // Regular single-digit input
      newOtp[index] = value;
      setOtp(newOtp);

      // Move to next input if current one is filled and not the last
      if (value !== "" && index < 5) {
        const nextIndex = index + 1;
        setTimeout(() => {
          setActiveInput(nextIndex);
          inputRefs.current[nextIndex]?.focus();
        }, 0);
      }

      // If last field is filled, submit automatically
      if (index === 5 && value && newOtp.every((digit) => digit !== "")) {
        setTimeout(() => {
          handleOtpSubmit(newOtp.join(""));
        }, 300);
      }
    }
  };

  // Modified handleKeyDown function for better backspace handling
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace") {
      if (!otp[index]) {
        // Move to previous input when backspace is pressed on an empty field
        if (index > 0) {
          const prevIndex = index - 1;
          setTimeout(() => {
            setActiveInput(prevIndex);
            inputRefs.current[prevIndex]?.focus();
          }, 0);
        }
      } else {
        // Clear current field but stay on it
        const newOtp = [...otp];
        newOtp[index] = "";
        setOtp(newOtp);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      const prevIndex = index - 1;
      setTimeout(() => {
        setActiveInput(prevIndex);
        inputRefs.current[prevIndex]?.focus();
      }, 0);
    } else if (e.key === "ArrowRight" && index < 5) {
      const nextIndex = index + 1;
      setTimeout(() => {
        setActiveInput(nextIndex);
        inputRefs.current[nextIndex]?.focus();
      }, 0);
    }
  };

  const handleOtpSubmit = async (otpValue: string) => {
    setError(null);
    setIsLoading(true);
    setIsVerifying(true); // Set this to true when verifying

    const formData = new FormData();
    formData.append("email", email);
    formData.append("otp", otpValue);

    try {
      const result = await verifyOtp(formData);
      if (result.success) {
        if (result.redirectTo) {
          router.push(result.redirectTo);
        } else {
          router.push("/");
        }
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError("Verification failed. Please try again.");
    } finally {
      setIsLoading(false);
      setIsVerifying(false); // Reset this when verification is complete
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
    } catch (err) {
      setError("Failed to send a new code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (otpSent && inputRefs.current[0]) {
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 0);
    }
  }, [otpSent]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">
            {otpSent ? "Enter verification code" : "Get access"}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {otpSent
              ? `We've sent a 6-digit code to ${email}`
              : "Sign in or create an account with your email"}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 my-4">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {otpSent ? (
          <div className="mt-8 space-y-6">
            <div className="flex justify-center space-x-2 sm:space-x-4">
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
                  maxLength={6} // Allow paste of full code
                  className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl border-2 border-neutral-300 rounded-lg hover:border-mercedes-primary/60 focus:border-mercedes-primary focus:outline-none"
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onFocus={() => setActiveInput(index)}
                  disabled={isLoading || isVerifying}
                />
              ))}
            </div>

            <div className="text-center mt-4">
              {isVerifying ? (
                <div className="flex justify-center items-center text-sm text-mercedes-primary">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-mercedes-primary"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Verifying code...
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isLoading || countdown > 0}
                  onClick={requestNewCode}
                  className="cursor-pointer text-sm text-mercedes-primary hover:underline focus:outline-none"
                >
                  {countdown > 0
                    ? `Request new code (${countdown}s)`
                    : "Didn't receive a code? Send again"}
                </button>
              )}
            </div>

            <div className="text-sm text-center mt-4">
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setOtp(["", "", "", "", "", ""]);
                  setError(null);
                }}
                className="cursor-pointer text-mercedes-primary hover:underline focus:outline-none"
                disabled={isVerifying}
              >
                Use a different email
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleEmailSubmit} className="mt-8 space-y-6">
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
                className="appearance-none rounded-lg relative block w-full px-3 py-3 border border-neutral-300 placeholder-gray-500 text-neutral-900 focus:outline-none focus:ring-mercedes-primary focus:border-mercedes-primary focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className={`cursor-pointer w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-mercedes-primary hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-mercedes-primary ${
                  isLoading ? "opacity-70 cursor-not-allowed" : ""
                } transition-all duration-300 ease-in-out`}
              >
                {isLoading ? "Sending..." : "Continue with Email"}
              </button>
            </div>

            <div className="text-sm text-center mt-4">
              <Link href="/" className="text-mercedes-primary hover:underline">
                Back to Just Notes
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
