import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        command: {
          bg: "#120D08",
          panel: "#1B120B",
          panel2: "#24170D",
          card: "#20150E",
          elevated: "#2A1B10",
          line: "rgba(212, 164, 74, 0.22)",
          text: "#FFF7E6",
          muted: "#D8C4A5",
          subtle: "#A88F6A",
          cyan: "#D6A84F",
          green: "#72C38C",
          amber: "#D6A84F",
          red: "#D9786D",
          blue: "#6FA8A6",
          bronze: "#B88935",
          gold: "#D6A84F",
          goldHover: "#E8C76A",
          yellow: "#F1D27A"
        }
      },
      boxShadow: {
        command: "0 18px 55px rgba(5, 3, 2, 0.42)",
        premium: "0 22px 70px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 247, 230, 0.04)"
      }
    }
  },
  plugins: []
};

export default config;
