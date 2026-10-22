import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base совпадает с адресом GitHub Pages: https://spyatikov.github.io/skinemsya/
export default defineConfig({
  base: "/skinemsya/",
  plugins: [react()],
});
