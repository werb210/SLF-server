import { EventEmitter } from "node:events"
import pino from "pino"
import pinoHttp from "pino-http"
import { describe, expect, it } from "vitest"
import { LOG_CENSOR, REDACTED_LOG_PATHS } from "../src/platform/logRedaction"

describe("log redaction", () => {
  it("redacts authorization headers from pino-http request logs", () => {
    const token = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.admin-token"
    const lines: string[] = []
    const stream = {
      write(chunk: string) {
        lines.push(chunk)
      }
    }
    const logger = pino(
      {
        name: "slf_server",
        redact: { paths: REDACTED_LOG_PATHS, censor: LOG_CENSOR }
      },
      stream
    )
    const middleware = pinoHttp({ logger })
    const res = new EventEmitter() as EventEmitter & {
      statusCode: number
      getHeader(name: string): string | number | string[] | undefined
      setHeader(name: string, value: string | number | readonly string[]): void
    }
    res.statusCode = 200
    res.getHeader = () => undefined
    res.setHeader = () => undefined

    middleware(
      {
        id: "request-id",
        method: "GET",
        url: "/api/slf/accounts",
        headers: {
          authorization: token,
          cookie: "session=secret"
        }
      } as Parameters<typeof middleware>[0],
      res as unknown as Parameters<typeof middleware>[1],
      () => undefined
    )
    res.emit("finish")

    const output = lines.join("")
    expect(output).not.toContain(token)
    expect(output).not.toContain("session=secret")
    expect(output).toContain(LOG_CENSOR)
  })
})
