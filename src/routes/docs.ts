import type { Express } from "express"
import swaggerUi from "swagger-ui-express"
import YAML from "yamljs"

// SLF_DOCS_NOT_IN_PROD_v784 - the spec maps every route; do not publish it in production.
export function docsRouter(app: Express, nodeEnv: string = process.env.NODE_ENV ?? "development") {
  if (nodeEnv === "production") return
  const spec = YAML.load("./src/docs/openapi.yaml")
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec))
}
