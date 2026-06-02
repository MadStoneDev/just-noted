"use client";

import { ReactNode, useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAnalyticsConsent } from "@/hooks/use-analytics-consent";

export default function LogRocketProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [supabase] = useState(() => createClient());
  const { hasConsented, isLoaded } = useAnalyticsConsent();
  const initializedRef = useRef(false);
  const lrRef = useRef<any>(null);

  useEffect(() => {
    if (!isLoaded || !hasConsented || initializedRef.current) return;

    const token = process.env.NEXT_PUBLIC_LOGROCKET_TOKEN;
    if (!token) return;

    import("logrocket").then((mod) => {
      const LogRocket = mod.default;
      lrRef.current = LogRocket;

      LogRocket.init(token, {
        dom: {
          textSanitizer: true,
          inputSanitizer: true,
        },
        network: {
          requestSanitizer: (request) => {
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
    });
  }, [isLoaded, hasConsented]);

  useEffect(() => {
    if (!initializedRef.current || !hasConsented || !lrRef.current) return;
    const LogRocket = lrRef.current;

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
        });
      } else {
        LogRocket.identify("anonymous");
      }
    };

    identifyUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: string, session: any) => {
      if (!initializedRef.current || !lrRef.current) return;

      if (event === "SIGNED_IN" && session?.user) {
        const { data: author } = await supabase
          .from("authors")
          .select("username")
          .eq("id", session.user.id)
          .single();

        lrRef.current.identify(session.user.id, {
          name: author?.username ?? "",
        });
      } else if (event === "SIGNED_OUT") {
        lrRef.current.identify("anonymous");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, hasConsented]);

  return <>{children}</>;
}
