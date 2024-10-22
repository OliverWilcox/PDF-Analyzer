// tailwind.config.js

module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          900: "#0f0f0f",
          800: "#1a1a1a",
          700: "#2a2a2a",
          600: "#3a3a3a",
          500: "#4a4a4a",
          400: "#5a5a5a",
          300: "#6a6a6a",
          200: "#7a7a7a",
          100: "#8a8a8a",
        },
        purple: {
          400: "#9f7aea",
          500: "#805ad5",
          600: "#6b46c1",
        },
        pink: {
          500: "#d53f8c",
        },
      },
    },
  },
  variants: {
    extend: {},
  },
  plugins: [],
};
