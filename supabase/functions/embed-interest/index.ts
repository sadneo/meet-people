import { GoogleGenAI } from "npm:@google/genai";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

// Optional shared secret. Set EMBED_SHARED_SECRET in .env to require it.
// If unset, the check is skipped (fine for local dev with --no-verify-jwt).
const EMBED_SHARED_SECRET = Deno.env.get("EMBED_SHARED_SECRET");

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

Deno.serve(async (req) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Optional shared-secret check. If EMBED_SHARED_SECRET is set,
  // callers must send it in the X-Embed-Secret header.
  if (EMBED_SHARED_SECRET) {
    const provided = req.headers.get("x-embed-secret");
    if (provided !== EMBED_SHARED_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  try {
    // Accept either { text } or { interestText } so older callers keep working
    const body = await req.json().catch(() => null);
    const text =
      (body && (body.text ?? body.interestText)) ||
      null;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Missing 'text' field" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const response = await ai.models.embedContent({
      model: "gemini-embedding-001",
      contents: text,
    });

    const embedding = response.embeddings?.[0]?.values;

    if (!embedding || embedding.length === 0) {
      console.error("Gemini returned no embedding for:", text);
      return new Response(JSON.stringify({ error: "No embedding returned" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ embedding }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("embed-interest error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});