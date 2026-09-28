import { resumeInactiveReceptionConversations } from "./conversation-engine";
import { logger } from "./logger";

const pollIntervalMs = 60_000;
let processing = false;

async function runCycle(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    const resumed = await resumeInactiveReceptionConversations();
    if (resumed > 0) {
      logger.info({ resumed }, "Inactive reception conversations returned to bot");
    }
  } catch (err) {
    logger.error({ err }, "Reception inactivity check failed; API will remain available");
  } finally {
    processing = false;
  }
}

export function startReceptionTimeoutWorker(): void {
  void runCycle();
  const timer = setInterval(() => void runCycle(), pollIntervalMs);
  timer.unref();
  logger.info("Reception inactivity worker started (24 hours without messages)");
}