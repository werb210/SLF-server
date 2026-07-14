import pinoHttp from "pino-http"
import { logger } from "../platform/logger"

export const requestLogger = pinoHttp({
  logger
})
