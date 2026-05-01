import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "prisma/config";

for (const envFile of [".env.local", ".env"]) {
  const envPath = resolve(process.cwd(), envFile);

  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "node prisma/seed.js"
  }
});
