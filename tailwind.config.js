/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        atlas: {
          dark: "#001A3D",
          mid: "#0a2744",
          blue: "#1e3a5f",
          light: "#2d4a6f",
        },
      },
    },
  },
  plugins: [],
};
