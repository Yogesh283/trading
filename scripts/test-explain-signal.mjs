/**
 * Quick check that OPENAI_API_KEY works with OpenAI (Responses or Chat, per OPENAI_API_MODE).
 * Run from repo root: node scripts/test-explain-signal.mjs
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env") });

const key = process.env.OPENAI_API_KEY?.trim();
if (!key) {
  console.error("FAIL: OPENAI_API_KEY missing in .env");
  process.exit(1);
}

const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const mode = (process.env.OPENAI_API_MODE || "responses").toLowerCase();
const openai = new OpenAI({ apiKey: key });

try {
  if (mode === "chat") {
    const completion = await openai.chat.completions.create({
      model,
      max_tokens: 80,
      messages: [
        { role: "system", content: "Reply with exactly: OK" },
        { role: "user", content: "ping" }
      ]
    });
    const text = completion.choices[0]?.message?.content?.trim();
    console.log("OK — OpenAI (chat) responded:", text ?? "(empty)");
  } else {
    const response = await openai.responses.create({
      model,
      instructions: "Reply with exactly: OK",
      input: "ping",
      max_output_tokens: 80,
      store: false
    });
    if (response.error) {
      console.error("FAIL:", response.error.message);
      process.exit(1);
    }
    console.log("OK — OpenAI (responses) output_text:", response.output_text ?? "(empty)");
  }
} catch (e) {
  console.error("FAIL:", e?.message ?? e);
  process.exit(1);
}
