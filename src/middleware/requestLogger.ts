import pinoHttp from "pino-http"
import { logger } from "../logging/logger"

export const requestLogger = pinoHttp({
  logger,
  autoLogging: true
})
