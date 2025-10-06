"use client";

import { ReactNode, useEffect, useState } from "react";
import LogRocket from "logrocket";
import { createClient } from "@/utils/supabase/client";

export default function LogRocketProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    LogRocket.init("lbse3k/justnoted");
  }, []);

  useEffect(() => {
    const identifyUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: author } = await supabase
          .from("authors")
          .select("username")
          .eq("id", user.id)
          .single();

        LogRocket.identify(user.id, {
          name: author?.username ?? "",
          email: user.email ?? "",
        });
      } else {
        // Identify anonymous users
        LogRocket.identify("anonymous");
      }
    };

    identifyUser(); // Actually call the function!

    // Listen for auth state changes (sign in/out)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        const { data: author } = await supabase
          .from("authors")
          .select("username")
          .eq("id", session.user.id)
          .single();

        LogRocket.identify(session.user.id, {
          name: author?.username ?? "",
          email: session.user.email ?? "",
        });
      } else if (event === "SIGNED_OUT") {
        LogRocket.identify("anonymous");
      }
    });

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  return <>{children}</>;
}
