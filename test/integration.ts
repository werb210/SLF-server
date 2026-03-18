import axios from "axios";
import crypto from "crypto";

const apiBaseUrl = process.env.SLF_BASE_URL ?? "http://localhost:4001";
const apiKey = process.env.API_KEY;
const hmacSecret = process.env.HMAC_SECRET;

if (!apiKey || !hmacSecret) {
  console.log(
    "Skipping integration request: set API_KEY and HMAC_SECRET to run test/integration.ts"
  );
  process.exit(0);
}

const payload = {
  id: "integration-test-1",
  product_family: "LOC",
  raw_payload: { amount: 12345 },
};

const signature = crypto
  .createHmac("sha256", hmacSecret)
  .update(JSON.stringify(payload))
  .digest("hex");

(async () => {
  try {
    const res = await axios.post(`${apiBaseUrl}/deals`, payload, {
      headers: {
        "x-api-key": apiKey,
        "x-signature": signature,
        "x-idempotency-key": "test-key-1",
      },
      timeout: 5000,
    });

    console.log(res.data);
  } catch (err) {
    if (axios.isAxiosError(err) && err.code === "ECONNREFUSED") {
      console.log(
        `Skipping integration request: ${apiBaseUrl} is not reachable (ECONNREFUSED)`
      );
      process.exit(0);
    }

    throw err;
  }
})();
