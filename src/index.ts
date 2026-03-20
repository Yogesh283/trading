import { logger } from "./utils/logger";
import { ensureDevChromeUser, promoteAdminFromEnv } from "./services/authService";
import { startServer, stopServer } from "./server";

let httpServer: Awaited<ReturnType<typeof startServer>> | null = null;

void (async () => {
  try {
    httpServer = await startServer();
  } catch (e) {
    logger.error({ e }, "Server failed to start");
    process.exit(1);
  }
  void promoteAdminFromEnv().catch((err) => logger.warn({ err }, "promoteAdminFromEnv"));
  void ensureDevChromeUser().catch((err) => logger.warn({ err }, "ensureDevChromeUser"));
})();

const shutdown = async (signal: string) => {
  logger.info({ signal }, "Shutting down gracefully");
  await stopServer();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
