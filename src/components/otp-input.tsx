// This version should fix the TypeScript error completely
"use client";

import React, {
  useState,
  useRef,
  KeyboardEvent,
  ClipboardEvent,
  useEffect,
} from "react";

interface OTPInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
}

export default function OTPInput({
  length = 6,
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  className = "",
  inputClassName = "",
}: OTPInputProps) {
  const [activeInput, setActiveInput] = useState(0);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Initialize the inputRefs array when the component mounts
  useEffect(() => {
    inputRefs.current = Array(length).fill(null);

    // Auto-focus the first input when the component mounts
    if (autoFocus && inputRefs.current[0]) {
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 0);
    }
  }, [length, autoFocus]);

  // Helper to split the OTP string into an array
  const getOtpValue = () => {
    return value.toString().split("");
  };

  // Move focus to the next input
  const focusInput = (index: number) => {
    const activeIndex = Math.max(Math.min(length - 1, index), 0);
    if (inputRefs.current[activeIndex]) {
      inputRefs.current[activeIndex]?.focus();
      setActiveInput(activeIndex);
    }
  };

  // Handle input change
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    index: number,
  ) => {
    const val = e.target.value;

    // Allow only single digit
    if (val.length > 1) {
      const singleDigit = val.charAt(val.length - 1);
      if (/^\d+$/.test(singleDigit)) {
        // If pasting multiple digits quickly, handle each digit
        const otpValue = getOtpValue();
        otpValue[index] = singleDigit;
        onChange(otpValue.join(""));

        // Move to next input if available
        if (index < length - 1) {
          focusInput(index + 1);
        }
      }
      return;
    }

    // Only allow numbers
    if (val && !/^\d+$/.test(val)) {
      return;
    }

    const otpValue = getOtpValue();
    otpValue[index] = val;

    // Update the OTP state
    onChange(otpValue.join(""));

    // If input is filled, move to next input
    if (val && index < length - 1) {
      focusInput(index + 1);
    }
  };

  // Handle backspace
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    const otpValue = getOtpValue();

    if (e.key === "Backspace") {
      e.preventDefault();

      // If current input has a value, clear it
      if (otpValue[index]) {
        otpValue[index] = "";
        onChange(otpValue.join(""));
      }
      // If current input is empty, move to previous input and clear it
      else if (index > 0) {
        otpValue[index - 1] = "";
        onChange(otpValue.join(""));
        focusInput(index - 1);
      }
    }
    // Arrow keys navigation
    else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusInput(index - 1);
    } else if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      focusInput(index + 1);
    } else if (e.key === "Delete") {
      e.preventDefault();

      // Clear current input
      if (otpValue[index]) {
        otpValue[index] = "";
        onChange(otpValue.join(""));
      }
    }
  };

  // Handle paste event
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();

    const pastedData = e.clipboardData.getData("text/plain").trim();

    // Check if pasted content is a number
    if (!/^\d+$/.test(pastedData)) {
      return;
    }

    // Take only the first `length` characters
    const pastedOtp = pastedData.slice(0, length);

    // Fill OTP fields with pasted content
    onChange(pastedOtp.padEnd(length, "").slice(0, length));

    // Focus the next empty input or the last input
    const nextEmptyIndex =
      pastedOtp.length < length ? pastedOtp.length : length - 1;
    focusInput(nextEmptyIndex);
  };

  // Handle input focus
  const handleFocus = (index: number) => {
    setActiveInput(index);
    // Select the content when focused
    inputRefs.current[index]?.select();
  };

  // Handle click on input
  const handleClick = (index: number) => {
    setActiveInput(index);
    inputRefs.current[index]?.select();
  };

  // Default input class with your brand colors
  const defaultInputClass =
    "w-12 h-12 text-center border-2 border-neutral-300 rounded-md text-lg text-center font-bold" +
    " focus:border-mercedes-primary focus:outline-none";
  const finalInputClass = inputClassName || defaultInputClass;

  return (
    <div className={`flex justify-center space-x-2 ${className}`}>
      {Array(length)
        .fill(0)
        .map((_, index) => {
          return (
            <input
              key={index}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              ref={(el) => {
                // Safe way to set ref that works with TypeScript
                inputRefs.current[index] = el;
              }}
              value={getOtpValue()[index] || ""}
              onChange={(e) => handleChange(e, index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              onPaste={handlePaste}
              onFocus={() => handleFocus(index)}
              onClick={() => handleClick(index)}
              disabled={disabled}
              className={finalInputClass}
              aria-label={`digit ${index + 1} of verification code`}
              autoComplete={index === 0 ? "one-time-code" : "off"}
            />
          );
        })}
    </div>
  );
}
