import type { Express } from "express"
import swaggerUi from "swagger-ui-express"
import YAML from "yamljs"

const spec = YAML.load("./src/docs/openapi.yaml")

export function docsRouter(app: Express) {
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec))
}
