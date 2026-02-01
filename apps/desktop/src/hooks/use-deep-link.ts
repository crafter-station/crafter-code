import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAuthStore } from "@/stores/auth-store";

export function useDeepLink() {
  const handleCallback = useAuthStore((s) => s.handleCallback);

  useEffect(() => {
    const unlisten = listen<string>("deep-link-received", async (event) => {
      const url = event.payload;
      console.log("Deep link received:", url);

      try {
        const parsed = new URL(url);

        if (parsed.protocol === "crafter-code:" && parsed.pathname === "//auth/callback") {
          const token = parsed.searchParams.get("token");
          const error = parsed.searchParams.get("error");
          const userJson = parsed.searchParams.get("user");

          if (error) {
            console.error("Auth error:", error);
            return;
          }

          if (token && userJson) {
            const user = JSON.parse(decodeURIComponent(userJson));
            await handleCallback(token, user);
          }
        }
      } catch (error) {
        console.error("Failed to parse deep link:", error);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleCallback]);
}
