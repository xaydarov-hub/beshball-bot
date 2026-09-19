/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "bb-red": "#d0342c",
        "bb-yellow": "#f2b705",
        "bb-charcoal": "#2b2b2b",
      },
    },
  },
  plugins: [],
};
