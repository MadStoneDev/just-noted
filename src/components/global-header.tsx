"use client";

import React, { useState } from "react";
import Link from "next/link";

import { IconCategoryFilled } from "@tabler/icons-react";

export default function GlobalHeader() {
  // States
  const [openMenu, setOpenMenu] = useState(false);

  return (
    <header className={`fixed w-full z-50`}>
      <section
        className={`mb-4 px-4 sm:px-8 py-4 flex items-center justify-between w-full h-16 bg-mercedes-primary font-secondary z-50`}
      >
        <Link href={`/`} className={`text-xl font-semibold`}>
          Just
          <span className={`text-white`}>Noted</span>
        </Link>

        <button
          type={`button`}
          onClick={() => setOpenMenu(!openMenu)}
          className={`cursor-pointer sm:hidden ${
            openMenu ? "rotate-135 delay-200" : "delay-0"
          } transition-all duration-500 ease-in-out`}
        >
          <IconCategoryFilled className={`w-6 h-6 text-white`} />
        </button>

        <article
          className={`fixed sm:relative mt-16 sm:mt-0 p-5 sm:p-auto ${
            openMenu ? "top-0" : "-top-full"
          } sm:top-auto right-0 sm:right-auto left-0 sm:left-auto flex flex-col sm:flex-row items-center gap-4 sm:gap-6 bg-white sm:bg-transparent -z-10 sm:z-0 transition-all duration-700 ease-in-out`}
        >
          <Link
            href={`/`}
            onClick={() => setOpenMenu(false)}
            className={`sm:hidden px-3 py-1.5 w-full sm:w-auto hover:bg-mercedes-primary sm:hover:bg-white hover:shadow-xl shadow-mercedes-secondary/10 text-base font-bold text-mercedes-primary sm:text-neutral-900 hover:text-white sm:hover:text-mercedes-primary text-center transition-all duration-300 ease-in-out`}
          >
            Home
          </Link>

          <Link
            href={`/the-what`}
            onClick={() => setOpenMenu(false)}
            className={`px-3 py-1.5 w-full sm:w-auto hover:bg-mercedes-primary sm:hover:bg-white hover:shadow-xl shadow-mercedes-secondary/10 text-base font-bold text-mercedes-primary sm:text-neutral-900 hover:text-white sm:hover:text-mercedes-primary text-center transition-all duration-300 ease-in-out`}
          >
            The What
          </Link>

          <div className={`hidden sm:block w-[1px] h-3 bg-neutral-50`}></div>

          <Link
            href={`/the-how`}
            onClick={() => setOpenMenu(false)}
            className={`px-3 py-1.5 w-full sm:w-auto hover:bg-mercedes-primary sm:hover:bg-white hover:shadow-xl shadow-mercedes-secondary/10 text-base font-bold text-mercedes-primary sm:text-neutral-900 hover:text-white sm:hover:text-mercedes-primary text-center transition-all duration-300 ease-in-out`}
          >
            The How
          </Link>

          <div className={`hidden sm:block w-[1px] h-3 bg-neutral-50`}></div>

          <Link
            href={`/contact`}
            onClick={() => setOpenMenu(false)}
            className={`px-3 py-1.5 w-full sm:w-auto hover:bg-mercedes-primary sm:hover:bg-white hover:shadow-xl shadow-mercedes-secondary/10 text-base font-bold text-mercedes-primary sm:text-neutral-900 hover:text-white sm:hover:text-mercedes-primary text-center transition-all duration-300 ease-in-out`}
          >
            Get in Touch
          </Link>
        </article>
      </section>

      <div
        onClick={() => setOpenMenu(false)}
        className={`sm:hidden fixed top-0 right-0 bottom-0 left-0 bg-neutral-900 ${
          openMenu
            ? "opacity-20 delay-200"
            : "pointer-events-none opacity-0 delay-0"
        } -z-40 transition-all duration-500 ease-in-out`}
      ></div>
    </header>
  );
}
