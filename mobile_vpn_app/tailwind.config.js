/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        canvas: "#f1f4ef",
        brand: {
          blue: "#164f66",
          blueDark: "#102f46",
          blueLight: "#e5efed",
          green: "#138466",
          greenDark: "#11634d",
          greenLight: "#e1f2e9",
        },
      },
    },
  },
  plugins: [],
};
