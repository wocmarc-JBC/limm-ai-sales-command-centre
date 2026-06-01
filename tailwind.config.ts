import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        command: {
          bg: "#05070A",
          panel: "#090D12",
          panel2: "#101820",
          card: "rgba(255,255,255,0.04)",
          elevated: "rgba(214,168,79,0.08)",
          line: "rgba(214,168,79,0.24)",
          text: "#F8F3E7",
          muted: "#C9B99A",
          subtle: "#7D8CA3",
          cyan: "#22D3EE",
          green: "#22C55E",
          amber: "#F59E0B",
          red: "#EF4444",
          blue: "#38BDF8",
          bronze: "#B88935",
          gold: "#D6A84F",
          goldHover: "#F5C542",
          yellow: "#F5C542"
        }
      },
      boxShadow: {
        command: "0 18px 55px rgba(0, 0, 0, 0.48)",
        premium: "0 24px 80px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.07)",
        glow: "0 0 32px rgba(34, 211, 238, 0.14), 0 0 42px rgba(214, 168, 79, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
