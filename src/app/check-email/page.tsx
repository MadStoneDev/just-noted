import React from "react";

export const metadata = {
  title: "Check Your Email - JustNoted",
  description:
    "Check your email for the verification code to access your JustNoted account.",
};

export default function CheckEmailPage() {
  return (
    <div className="container mx-auto px-4 py-12 text-center">
      <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-mercedes-primary mb-4">
          Check Your Email
        </h1>

        <h2 className="text-lg mb-6">
          We've sent you a verification code! You should receive an email from
          us in a few minutes.
        </h2>

        <div className="bg-gray-50 p-4 rounded-lg mt-6">
          <p className="text-sm text-gray-600">
            Remember to check your spam folder if you don't see the email in
            your inbox.
          </p>
        </div>

        <p className="mt-8 text-sm text-gray-500">
          Return to{" "}
          <a
            href="/get-access"
            className="text-mercedes-primary hover:underline"
          >
            login page
          </a>{" "}
          if you need to try again.
        </p>
      </div>
    </div>
  );
}
