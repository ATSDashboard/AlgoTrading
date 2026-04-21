import { create } from "zustand";
import { persist } from "zustand/middleware";

type Mode = "dark" | "light" | "system";

interface ThemeState {
  mode: Mode;
  setMode: (m: Mode) => void;
  apply: () => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: "dark",
      setMode: (mode) => { set({ mode }); get().apply(); },
      apply: () => {
        const mode = get().mode;
        const prefers = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const dark = mode === "dark" || (mode === "system" && prefers);
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.classList.toggle("light", !dark);
      },
    }),
    {
      name: "navin-theme",
      onRehydrateStorage: () => (state) => state?.apply(),
    }
  )
);
