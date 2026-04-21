/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg:      "var(--bg)",
        panel:   "var(--panel)",
        "panel-2": "var(--panel-2)",
        border:  "var(--border)",
        ink:     "var(--ink)",
        muted:   "var(--muted)",
        accent:  "var(--accent)",
        success: "var(--success)",
        danger:  "var(--danger)",
        warn:    "var(--warn)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
