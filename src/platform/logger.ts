import pino from "pino"
import { env } from "./env"

export const logger = pino({
  name: env.SERVICE_NAME,
  level: env.LOG_LEVEL || "info",
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino-pretty"
        }
      : undefined
})
