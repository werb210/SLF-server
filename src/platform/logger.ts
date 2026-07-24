import pino from "pino"
import { env } from "./env"
import { REDACTED_LOG_PATHS, LOG_CENSOR } from "./logRedaction"

export const logger = pino({
  name: env.SERVICE_NAME,
  level: env.LOG_LEVEL || "info",
  // SLF_LOG_REDACTION_v1 - redact credential-bearing HTTP headers before logs are emitted.
  redact: { paths: REDACTED_LOG_PATHS, censor: LOG_CENSOR },
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino-pretty"
        }
      : undefined
})
