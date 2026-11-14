import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  const backendDirectory = fileURLToPath(
    new URL("./backend/", import.meta.url),
  );

  const { API_TOKEN } = loadEnv(
    mode,
    backendDirectory,
    "API_TOKEN",
  );

  if (!API_TOKEN) {
    throw new Error("API_TOKEN در backend/.env تنظیم نشده است.");
  }

  return {
    server: {
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          headers: {
            Authorization: `Bearer ${API_TOKEN}`,
          },
        },
      },
    },
  };
});