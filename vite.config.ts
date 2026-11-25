import { defineConfig } from "vite";

export default defineConfig({
  base: "/ember-crypt/",
  publicDir: "public",
  server: { host: true, port: 5174 },
  preview: { host: true, port: 4174 },
  // v0.8.1: conservative target for older iPhones (Safari 14+)
  build: { target: ["es2020", "safari14"], sourcemap: true },
});
