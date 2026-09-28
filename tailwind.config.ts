import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        bone: "rgb(var(--color-bone) / <alpha-value>)",
        rust: "rgb(var(--color-rust) / <alpha-value>)",
        ash: "rgb(var(--color-ash) / <alpha-value>)",
        silver: "rgb(var(--color-silver) / <alpha-value>)",
        graphite: "rgb(var(--color-graphite) / <alpha-value>)"
      },
      fontFamily: {
        display: ["var(--font-cormorant)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Arial", "sans-serif"]
      }
    }
  },
  plugins: []
};
export default config;
