import { defineConfig } from "vite";

export default defineConfig({
  base: "/ember-crypt/",
  publicDir: "public",
  server: { host: true, port: 5174 },
  preview: { host: true, port: 4174 },
  build: { target: "es2022", sourcemap: true },
});
