import axios from "axios"
import { env } from "../config/env"

export const slfClient = axios.create({
  baseURL: env.SLF_BASE_URL,
  headers: {
    Authorization: env.SLF_TOKEN,
    Accept: "application/json"
  },
  timeout: 15000
})
