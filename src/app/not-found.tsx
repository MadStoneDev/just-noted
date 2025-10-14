import React from "react";
import Link from "next/link";
import { IconHome, IconSearch } from "@tabler/icons-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-neutral-200 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          {/* 404 Number */}
          <div className="mb-6">
            <h1 className="text-8xl font-bold text-neutral-300 font-secondary">
              404
            </h1>
          </div>

          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-neutral-100 rounded-full">
              <IconSearch
                size={48}
                className="text-neutral-400"
                strokeWidth={1.5}
              />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-semibold text-neutral-900 mb-2">
            Page Not Found
          </h2>

          {/* Description */}
          <p className="text-neutral-600 mb-6">
            The page you're looking for doesn't exist. It might have been moved
            or deleted. Let's get you back to your notes.
          </p>

          {/* Action button */}
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-mercedes-primary hover:bg-mercedes-primary/90 text-white rounded-xl font-medium transition-all duration-200"
          >
            <IconHome size={20} strokeWidth={1.5} />
            Back to Home
          </Link>
        </div>

        {/* Additional text */}
        <p className="text-center text-sm text-neutral-600 mt-4">
          Your notes are safe and waiting for you
        </p>
      </div>
    </div>
  );
}
