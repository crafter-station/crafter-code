import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
}

interface AuthState {
  isLoaded: boolean;
  isAuthenticated: boolean;
  user: User | null;
  sessionToken: string | null;

  initialize: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  handleCallback: (token: string, user: User) => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isLoaded: false,
      isAuthenticated: false,
      user: null,
      sessionToken: null,

      initialize: async () => {
        try {
          const storedToken = await invoke<string | null>("auth_get_stored_token");

          if (storedToken) {
            const state = get();
            if (state.user) {
              set({
                isLoaded: true,
                isAuthenticated: true,
                sessionToken: storedToken,
              });
              return;
            }
          }

          set({ isLoaded: true, isAuthenticated: false });
        } catch (error) {
          console.error("Auth initialization failed:", error);
          set({ isLoaded: true, isAuthenticated: false });
        }
      },

      login: async () => {
        await invoke("auth_open_login");
      },

      logout: async () => {
        await invoke("auth_clear_token");
        set({
          isAuthenticated: false,
          user: null,
          sessionToken: null,
        });
      },

      handleCallback: async (token: string, user: User) => {
        try {
          await invoke("auth_store_token", { token });
          set({
            isAuthenticated: true,
            user,
            sessionToken: token,
          });
        } catch (error) {
          console.error("Callback handling failed:", error);
          throw error;
        }
      },
    }),
    {
      name: "crafter-code-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
