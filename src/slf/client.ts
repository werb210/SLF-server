import axios from "axios"
import { env } from "../config/env"

// SLF is Django REST Framework: the token header is `Token <key>`, not a bare value and not Bearer.
export const slfClient = axios.create({
  baseURL: env.SLF_BASE_URL,
  headers: { Authorization: env.SLF_AUTH_SCHEME ? `${env.SLF_AUTH_SCHEME} ${env.SLF_TOKEN}` : env.SLF_TOKEN, Accept: "application/json" },
  timeout: 30000
})
