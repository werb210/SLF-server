import pino, { type DestinationStream } from "pino"
import { env } from "./env"
import { REDACTED_LOG_PATHS, LOG_CENSOR } from "./logRedaction"
import { redactAxiosError } from "./redactAxios"

// The destination parameter exists so tests can capture exactly what this
// configuration writes, redaction included.
export function createLogger(destination?: DestinationStream) {
  const options: pino.LoggerOptions = {
    name: env.SERVICE_NAME,
    level: env.LOG_LEVEL || "info",
    // SLF_LOG_REDACTION_v1 - redact credential-bearing HTTP headers before logs are emitted.
    redact: { paths: REDACTED_LOG_PATHS, censor: LOG_CENSOR },
    // SLF_REDACT_AXIOS_v789 - path redaction cannot reach every copy of the SLF
    // token inside a raw axios error (the ClientRequest graph repeats it under
    // _redirectable, the socket and more), so any { err } is stripped first.
    serializers: { err: (err: unknown) => pino.stdSerializers.err(redactAxiosError(err) as Error) },
    transport:
      !destination && env.NODE_ENV === "development"
        ? {
            target: "pino-pretty"
          }
        : undefined
  }
  return destination ? pino(options, destination) : pino(options)
}

export const logger = createLogger()
