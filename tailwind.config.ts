import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        command: {
          bg: "#0b0d10",
          panel: "#12161d",
          panel2: "#171c24",
          line: "#29313c",
          text: "#f2f5f8",
          muted: "#9aa6b2",
          cyan: "#39c5d8",
          green: "#56d364",
          amber: "#f2c94c",
          red: "#ff6b6b"
        }
      },
      boxShadow: {
        command: "0 18px 55px rgba(0,0,0,0.28)"
      }
    }
  },
  plugins: []
};

export default config;
