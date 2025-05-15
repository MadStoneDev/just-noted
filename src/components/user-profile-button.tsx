// components/user-profile-button.tsx
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import { IconUser, IconKey } from "@tabler/icons-react";

export default function UserProfileButton() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();

      // Check if user is authenticated
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setIsAuthenticated(true);

        // Get user avatar
        const { data } = await supabase
          .from("authors")
          .select("avatar_url")
          .eq("id", user.id)
          .single();

        if (data) {
          setAvatarUrl(data.avatar_url);
        }
      } else {
        setIsAuthenticated(false);
      }

      setIsLoading(false);
    }

    checkAuth();
  }, []);

  if (isLoading) {
    return null; // Don't render anything while loading
  }

  if (isAuthenticated) {
    return (
      <Link
        href={"/profile"}
        className="px-2 py-2 flex justify-center items-center gap-2 w-full md:w-auto hover:bg-mercedes-primary md:hover:bg-white hover:shadow-xl shadow-mercedes-secondary/10 text-base font-bold text-mercedes-primary md:text-neutral-900 hover:text-white md:hover:text-mercedes-primary text-center transition-all duration-300 ease-in-out"
      >
        {avatarUrl ? (
          <div className="w-6 h-6 rounded-full overflow-hidden">
            <img
              src={avatarUrl}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <IconUser size={22} strokeWidth={2} />
        )}
        <span className="md:hidden">Profile</span>
      </Link>
    );
  }

  return (
    <Link
      href={"/get-access"}
      className="px-3 py-1.5 flex justify-center items-center gap-2 w-full md:w-auto hover:bg-mercedes-primary md:hover:bg-white hover:shadow-xl shadow-mercedes-secondary/10 text-base font-bold text-mercedes-primary md:text-neutral-900 hover:text-white md:hover:text-mercedes-primary text-center transition-all duration-300 ease-in-out"
    >
      <IconKey size={22} strokeWidth={2} />
      <span className="md:hidden">Get Access</span>
    </Link>
  );
}
