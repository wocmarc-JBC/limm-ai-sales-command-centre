import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        command: {
          bg: "#05070A",
          panel: "#090E14",
          panel2: "#0E151D",
          card: "rgba(255,255,255,0.045)",
          elevated: "rgba(221,179,93,0.085)",
          line: "rgba(201,185,154,0.20)",
          text: "#F7F2E8",
          muted: "#CBC0AD",
          subtle: "#8F9CAF",
          cyan: "#55C7D9",
          green: "#42C97A",
          amber: "#F0A93A",
          red: "#F06464",
          blue: "#65BDE9",
          bronze: "#B68B43",
          gold: "#DDB35D",
          goldHover: "#F1C968",
          yellow: "#EAC45F"
        }
      },
      boxShadow: {
        command: "0 16px 48px rgba(0, 0, 0, 0.42)",
        premium: "0 20px 64px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.055)",
        glow: "0 0 30px rgba(85, 199, 217, 0.10), 0 0 38px rgba(221, 179, 93, 0.07)"
      }
    }
  },
  plugins: []
};

export default config;
