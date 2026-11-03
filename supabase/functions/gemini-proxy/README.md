# gemini-proxy

The only component that talks to Google Gemini. Keeps `GEMINI_API_KEY` off the
client entirely.

## Secrets

```bash
supabase secrets set GEMINI_API_KEY=AQ.xxxxxxxx
# SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
```

For local development create `supabase/.env.local` (git-ignored):

```ini
GEMINI_API_KEY=AQ.xxxxxxxx
```

## Run

```bash
supabase functions serve gemini-proxy --env-file supabase/.env.local
supabase functions deploy gemini-proxy
```

## Request

```http
POST /functions/v1/gemini-proxy
Authorization: Bearer <user access token>
Content-Type: application/json

{
  "action": "generate",
  "model": "flash",
  "stream": true,
  "payload": {
    "systemInstruction": "...",
    "tools": [{ "name": "list_components", "description": "...", "parameters": { ... } }],
    "contents": [
      { "role": "user", "parts": [{ "text": "Build a 1500 EUR 1440p gaming PC" }] },
      { "role": "model", "parts": [{ "functionCall": { "name": "list_components", "args": { "category": "gpu" } } }] },
      { "role": "user", "parts": [{ "functionResponse": { "name": "list_components", "response": { "components": [] } } }] }
    ]
  }
}
```

## Responses

| Mode           | Content-Type        | Shape                                                           |
| -------------- | ------------------- | --------------------------------------------------------------- |
| non-stream     | `application/json`  | `{ ok, data: { text, toolCalls }, meta: { model, remaining } }` |
| `stream: true` | `text/event-stream` | `data: {"type":"start"…}` then `token`* then `done`             |
| error          | `application/json`  | `{ ok: false, error: { code, message } }`                       |

SSE events: `start` → `token` (many) → optionally `tool_call` → `done`
(`{ text, toolCalls }`) or `error`.

## Actions

| action       | Model default | Use                                                         |
| ------------ | ------------- | ----------------------------------------------------------- |
| `generate`   | `flash`       | Agentic turn (tool calls) — the browser owns the agent loop |
| `advise`     | `flash`       | One-shot grounded answer                                    |
| `structured` | `pro`         | JSON-schema constrained output (Build Doctor, FPS)          |
| `health`     | —             | Public probe, no auth, no Gemini call                       |

## Error codes

`unauthorized` (401/403) · `rate_limited` (429) · `invalid_request` (400) ·
`upstream_error` (502) · `upstream_timeout` (504) · `not_configured` (500) ·
`internal` (500)

## Models

The proxy pins an allow-list — a client cannot request an arbitrary model:

| Key     | Model              | Why                                           |
| ------- | ------------------ | --------------------------------------------- |
| `flash` | `gemini-3.5-flash-lite` | Streaming + tool calling, lowest latency      |
| `pro`   | `gemini-3.5-flash` | Higher quality for analysis/structured output |

> `gemini-2.5-flash` is **retired for new API keys** and `gemini-3.8-pro` does
> not exist — both verified live against this project's key. Change `MODELS` in
> `index.ts` if Google rotates availability.

## Rate limit

20 requests / 60 s per user, enforced in Postgres (`ai_usage`) so it holds
across isolates and cold starts. The 21st request in the window returns
`429 { code: 'rate_limited' }`.
