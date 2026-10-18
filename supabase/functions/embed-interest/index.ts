import { embedInterest } from '../_shared/embedding.ts'

Deno.serve(request => embedInterest(request, {
  apiKey: Deno.env.get('GEMINI_API_KEY'),
  sharedSecret: Deno.env.get('EMBED_SHARED_SECRET'),
}))
