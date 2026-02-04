"use client";

import { ReactNode, useEffect, useState, useRef } from "react";
import LogRocket from "logrocket";
import { createClient } from "@/utils/supabase/client";
import { useAnalyticsConsent } from "@/hooks/use-analytics-consent";

export default function LogRocketProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [supabase] = useState(() => createClient());
  const { hasConsented, isLoaded } = useAnalyticsConsent();
  const initializedRef = useRef(false);

  // Only initialize LogRocket if user has consented
  useEffect(() => {
    if (!isLoaded || !hasConsented || initializedRef.current) return;

    const token = process.env.NEXT_PUBLIC_LOGROCKET_TOKEN;
    if (!token) return;

    LogRocket.init(token, {
      // Configure LogRocket to be more privacy-friendly
      dom: {
        // Don't record text input by default
        textSanitizer: true,
        // Don't record input values by default
        inputSanitizer: true,
      },
      network: {
        // Don't capture request/response bodies
        requestSanitizer: (request) => {
          // Remove authorization headers and bodies
          if (request.headers) {
            delete request.headers["Authorization"];
            delete request.headers["Cookie"];
          }
          request.body = undefined;
          return request;
        },
        responseSanitizer: (response) => {
          response.body = undefined;
          return response;
        },
      },
    });
    initializedRef.current = true;
  }, [isLoaded, hasConsented]);

  // Identify user only after initialization and consent
  useEffect(() => {
    if (!initializedRef.current || !hasConsented) return;

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

        // Only send minimal identifying info
        LogRocket.identify(user.id, {
          name: author?.username ?? "",
          // Don't send email for privacy
        });
      } else {
        LogRocket.identify("anonymous");
      }
    };

    identifyUser();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!initializedRef.current) return;

      if (event === "SIGNED_IN" && session?.user) {
        const { data: author } = await supabase
          .from("authors")
          .select("username")
          .eq("id", session.user.id)
          .single();

        LogRocket.identify(session.user.id, {
          name: author?.username ?? "",
        });
      } else if (event === "SIGNED_OUT") {
        LogRocket.identify("anonymous");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, hasConsented]);

  return <>{children}</>;
}
