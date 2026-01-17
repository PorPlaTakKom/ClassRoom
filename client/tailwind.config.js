/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Mali", "ui-sans-serif", "system-ui"],
        body: ["Mali", "ui-sans-serif", "system-ui"]
      },
      colors: {
        ink: {
          50: "#f5f5f6",
          100: "#e6e6e7",
          200: "#c9c9cd",
          300: "#a9a9ae",
          400: "#8a8b91",
          500: "#6c6d73",
          600: "#56565c",
          700: "#404046",
          800: "#2a2a2f",
          900: "#151518"
        },
        blush: {
          300: "#fbb6b6",
          400: "#f38c8c",
          500: "#ec6262",
          600: "#d84b4b"
        },
        sky: {
          300: "#a9d8ff",
          400: "#7fc1ff",
          500: "#57a9ff"
        }
      },
      boxShadow: {
        glow: "0 20px 50px rgba(87, 169, 255, 0.2)",
        card: "0 25px 60px rgba(21, 21, 24, 0.35)"
      }
    }
  },
  plugins: [require("@tailwindcss/typography")]
};
