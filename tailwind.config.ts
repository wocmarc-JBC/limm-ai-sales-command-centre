import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        command: {
          bg: "#120c07",
          panel: "#1d140d",
          panel2: "#271b11",
          line: "#5a4227",
          text: "#fff8e7",
          muted: "#c8b58e",
          cyan: "#f4c95d",
          green: "#7bd88f",
          amber: "#f2c94c",
          red: "#ff7b6f",
          bronze: "#8a612f",
          gold: "#f6d36b"
        }
      },
      boxShadow: {
        command: "0 18px 55px rgba(34,18,4,0.45)"
      }
    }
  },
  plugins: []
};

export default config;
