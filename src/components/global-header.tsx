"use client";

import Link from "next/link";
import React, { useState } from "react";

import { User } from "@supabase/supabase-js";
import { IconCategoryFilled, IconKey, IconUser } from "@tabler/icons-react";

interface GlobalHeaderProps {
  user: User | null;
}

export default function GlobalHeader({ user }: GlobalHeaderProps) {
  // States
  const [openMenu, setOpenMenu] = useState(false);

  return (
    <header className={`fixed w-full z-50 print:hidden`}>
      <section
        className={`px-4 md:px-8 py-4 flex items-center justify-between w-full h-16 bg-white border-b border-neutral-200/60 font-secondary z-50`}
      >
        <Link href={`/`} className={`text-xl font-semibold text-mercedes-secondary`}>
          <span className="text-mercedes-primary">Just</span>Noted
        </Link>

        <button
          type={`button`}
          onClick={() => setOpenMenu(!openMenu)}
          aria-label={openMenu ? "Close menu" : "Open menu"}
          className={`min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer md:hidden ${
            openMenu ? "rotate-135 delay-200" : "delay-0"
          } transition-all duration-500 ease-in-out`}
        >
          <IconCategoryFilled className={`w-6 h-6 text-mercedes-primary`} />
        </button>

        <article
          className={`fixed md:relative mt-16 md:mt-0 p-5 md:p-auto ${
            openMenu ? "top-0" : "-top-full"
          } md:top-auto right-0 md:right-auto left-0 md:left-auto flex flex-col md:flex-row items-center gap-4 md:gap-3 bg-white md:bg-transparent border-b border-neutral-200 shadow-lg md:border-0 md:shadow-none -z-10 md:z-0 transition-all duration-700 ease-in-out`}
        >
          <Link
            href={`/`}
            onClick={() => setOpenMenu(false)}
            className={`md:hidden px-3 py-1.5 w-full md:w-auto font-medium text-neutral-600 hover:text-mercedes-primary hover:bg-mercedes-primary/5 rounded-lg text-center transition-all duration-300 ease-in-out`}
          >
            Home
          </Link>

          <Link
            href={`/the-what`}
            onClick={() => setOpenMenu(false)}
            className={`px-3 py-1.5 w-full md:w-auto font-medium text-neutral-600 hover:text-mercedes-primary hover:bg-mercedes-primary/5 rounded-lg text-center transition-all duration-300 ease-in-out`}
          >
            The What
          </Link>

          <div className={`hidden md:block w-[1px] h-3 bg-neutral-200`}></div>

          <Link
            href={`/the-how`}
            onClick={() => setOpenMenu(false)}
            className={`px-3 py-1.5 w-full md:w-auto font-medium text-neutral-600 hover:text-mercedes-primary hover:bg-mercedes-primary/5 rounded-lg text-center transition-all duration-300 ease-in-out`}
          >
            The How
          </Link>

          <div className={`hidden md:block w-[1px] h-3 bg-neutral-200`}></div>

          <Link
            href={`/contact`}
            onClick={() => setOpenMenu(false)}
            className={`px-3 py-1.5 w-full md:w-auto font-medium text-neutral-600 hover:text-mercedes-primary hover:bg-mercedes-primary/5 rounded-lg text-center transition-all duration-300 ease-in-out`}
          >
            Get in Touch
          </Link>

          {user ? (
            <>
              <div
                className={`hidden md:block w-[1px] h-3 bg-neutral-200`}
              ></div>

              <Link
                href={`/profile`}
                onClick={() => setOpenMenu(false)}
                className={`px-3 py-1.5 flex items-center justify-center gap-2 w-full md:w-auto font-medium text-neutral-600 hover:text-mercedes-primary hover:bg-mercedes-primary/5 rounded-lg text-center transition-all duration-300 ease-in-out`}
              >
                <IconUser size={22} />
                Profile
              </Link>
            </>
          ) : (
            <>
              <div
                className={`hidden md:block w-[1px] h-3 bg-neutral-200`}
              ></div>

              <Link
                href={`/get-access`}
                onClick={() => setOpenMenu(false)}
                className={`px-3 py-1.5 flex items-center justify-center gap-2 w-full md:w-auto font-medium text-neutral-600 hover:text-mercedes-primary hover:bg-mercedes-primary/5 rounded-lg text-center transition-all duration-300 ease-in-out`}
              >
                <IconKey size={22} />
                Get Access
              </Link>
            </>
          )}
        </article>
      </section>

      <div
        onClick={() => setOpenMenu(false)}
        className={`md:hidden fixed top-0 right-0 bottom-0 left-0 bg-neutral-900 ${
          openMenu
            ? "opacity-20 delay-200"
            : "pointer-events-none opacity-0 delay-0"
        } -z-40 transition-all duration-500 ease-in-out`}
      ></div>
    </header>
  );
}
