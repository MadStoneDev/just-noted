"use client";

import React, { useState } from "react";
import Link from "next/link";

import { IconCategoryFilled, IconKey } from "@tabler/icons-react";
import UserProfileButton from "@/components/user-profile-button";

export default function GlobalHeader() {
  // States
  const [openMenu, setOpenMenu] = useState(false);

  return (
    <header className={`fixed w-full z-50`}>
      <section
        className={`mb-4 px-4 md:px-8 py-4 flex items-center justify-between w-full h-16 bg-mercedes-primary font-secondary z-50`}
      >
        <Link href={`/`} className={`text-xl font-semibold`}>
          Just
          <span className={`text-white`}>Noted</span>
        </Link>

        <button
          type={`button`}
          onClick={() => setOpenMenu(!openMenu)}
          className={`cursor-pointer md:hidden ${
            openMenu ? "rotate-135 delay-200" : "delay-0"
          } transition-all duration-500 ease-in-out`}
        >
          <IconCategoryFilled className={`w-6 h-6 text-white`} />
        </button>

        <article
          className={`fixed md:relative mt-16 md:mt-0 p-5 md:p-auto ${
            openMenu ? "top-0" : "-top-full"
          } md:top-auto right-0 md:right-auto left-0 md:left-auto flex flex-col md:flex-row items-center gap-4 md:gap-3 bg-white md:bg-transparent -z-10 md:z-0 transition-all duration-700 ease-in-out`}
        >
          <Link
            href={`/`}
            onClick={() => setOpenMenu(false)}
            className={`md:hidden px-3 py-1.5 w-full md:w-auto hover:bg-mercedes-primary md:hover:bg-white hover:shadow-xl shadow-mercedes-secondary/10 text-base font-bold text-mercedes-primary md:text-neutral-900 hover:text-white md:hover:text-mercedes-primary text-center transition-all duration-300 ease-in-out`}
          >
            Home
          </Link>

          <Link
            href={`/the-what`}
            onClick={() => setOpenMenu(false)}
            className={`px-3 py-1.5 w-full md:w-auto hover:bg-mercedes-primary md:hover:bg-white hover:shadow-xl shadow-mercedes-secondary/10 text-base font-bold text-mercedes-primary md:text-neutral-900 hover:text-white md:hover:text-mercedes-primary text-center transition-all duration-300 ease-in-out`}
          >
            The What
          </Link>

          <div className={`hidden md:block w-[1px] h-3 bg-neutral-50`}></div>

          <Link
            href={`/the-how`}
            onClick={() => setOpenMenu(false)}
            className={`px-3 py-1.5 w-full md:w-auto hover:bg-mercedes-primary md:hover:bg-white hover:shadow-xl shadow-mercedes-secondary/10 text-base font-bold text-mercedes-primary md:text-neutral-900 hover:text-white md:hover:text-mercedes-primary text-center transition-all duration-300 ease-in-out`}
          >
            The How
          </Link>

          <div className={`hidden md:block w-[1px] h-3 bg-neutral-50`}></div>

          <Link
            href={`/contact`}
            onClick={() => setOpenMenu(false)}
            className={`px-3 py-1.5 w-full md:w-auto hover:bg-mercedes-primary md:hover:bg-white hover:shadow-xl shadow-mercedes-secondary/10 text-base font-bold text-mercedes-primary md:text-neutral-900 hover:text-white md:hover:text-mercedes-primary text-center transition-all duration-300 ease-in-out`}
          >
            Get in Touch
          </Link>

          <div className={`hidden md:block w-[1px] h-3 bg-neutral-50`}></div>

          <UserProfileButton />
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
