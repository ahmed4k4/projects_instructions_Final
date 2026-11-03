# AI Architecture — Nexus PC Builder

How the AI is wired, what it is allowed to decide, and what it must never
decide.

## The core principle: determinism where it matters

| Concern                      | Owner                                              | Why                                                                                         |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Compatibility rules          | **Deterministic engine** (`src/lib/compatibility`) | Must be reproducible and explainable; a model cannot be trusted to know a GPU's length      |
| Build score                  | **Deterministic engine** (`src/lib/scoring`)       | Used as the agent's reward signal — if it could drift, the agent could "optimise" a fiction |
| Base FPS                     | **Deterministic** (`fps_benchmarks`)               | Measured data beats guesses                                                                 |
| Component selection          | **Gemini**                                         | Genuine judgement: trade-offs, budget allocation, preferences                               |
| Reasoning & narration        | **Gemini**                                         | Explaining _why_ is what users actually read                                                |
| FPS for unbenchmarked combos | **Gemini (cached)**                                | Better than nothing, clearly labelled and cached                                            |

The model never computes a number that the engines can compute. Every tool
result it sees already contains the computed price, wattage, compatibility and
score.

## Request flow

```mermaid
flowchart TB
    subgraph Browser["Browser (Vite/React)"]
        UI["Smart Builder · Advisor · Doctor"]
        Agent["Agent loop<br/>buildAgent / advisorAgent"]
        Tools["Tool executor<br/>aiTools.ts"]
        Engines["Deterministic engines<br/>compatibility · scoring · performance"]
        Svc["componentsService<br/>buildsService"]
        UI --> Agent
        Agent -->|tool calls| Tools
        Tools --> Engines
        Tools --> Svc
    end

    subgraph Vercel["Vercel Node.js Web Function · /api/ai/*"]
        Proxy["Gemini proxy<br/>Guest IP hash / optional JWT · atomic quota · allow-list · timeout"]
    end

    subgraph Google["Google AI Studio"]
        Gemini["gemini-3.5-flash-lite<br/>gemini-flash-lite-latest<br/>gemini-3.6-flash"]
    end

    subgraph DB["Postgres (RLS)"]
        Tables["components · compatibility_rules<br/>builds · builds_items · fps_benchmarks<br/>chat_sessions · ai_usage · build_ratings"]
    end

    Agent -->|"POST + Supabase access token<br/>(SSE or JSON)"| Proxy
    Proxy -->|"single authenticated quota RPC"| DB
    Proxy -->|"GEMINI_API_KEY (server only)"| Gemini
    Svc --> Tables
```

**The key never reaches the browser.** `GEMINI_API_KEY` and
`SUPABASE_ANON_KEY` and `SUPABASE_URL` are Vercel environment variables used for the authenticated quota RPC. The
browser receives only its Supabase anon key and the signed-in user's access
token. AI is available to guests and signed-in users. Guest calls use a server-side SHA-256 fingerprint of the Vercel client IP and an atomic 30 requests/minute quota in `ai_guest_usage`; signed-in users use their verified account and a separate 60 requests/minute quota in `ai_usage`. Login is optional and never gates the AI advisor or PC builder. `VITE_GEMINI_API_KEY` and
The AI proxy does not need or use the Supabase service-role key.

## The agent loop

Both the builder and the advisor use the same shape
(`src/services/buildAgent.ts`, `src/services/advisorAgent.ts`):

```
user turn → Gemini → tool calls → executor (DB + engines) → functionResponse
                ↑                                              │
                └───────────── repeat, capped at 5 rounds for Smart Builder and 2 tool rounds for Advisor ───────────┘
```

The **browser** owns the loop rather than the model because the tools run
deterministic TypeScript engines that must execute client-side. The proxy is a
stateless transport.

### Why the model cannot hallucinate a component

1. `finalize_build` is validated against `ToolExecutor.hasSeen(id)` — every
   component ID must have been returned by `list_components` or
   `get_component_details` in _this run_.
2. Unknown IDs trigger **one** corrective re-prompt listing the bad IDs.
3. A second failure (or any transport error, rate limit or timeout) drops to
   `fallbackBuild()` — a budget-weighted, deterministic picker that is
   guaranteed to produce valid IDs because it reads the catalogue directly.

Refinements follow the same rule: `refineBuild` shows the model only the
_names_ of the existing parts, never their IDs, so it still has to search.

## Tool definitions

| Tool                    | Calls           | Returns                                        |
| ----------------------- | --------------- | ---------------------------------------------- |
| `list_components`       | catalogue read  | up to 12 compact rows (id, price, perf, specs) |
| `get_component_details` | catalogue read  | one full component                             |
| `check_compatibility`   | **engine**      | `{ isCompatible, errors[], warnings[] }`       |
| `get_build_score`       | **engine**      | `{ total, breakdown, totalPrice, totalWatts }` |
| `suggest_alternatives`  | catalogue read  | ≤3 ranked alternatives                         |
| `get_build`             | advisor context | the build snapshot supplied by the page        |
| `finalize_build`        | terminal        | build name, items + reasons, explanation       |

Tool schemas live in `src/services/prompts/buildGenerator.ts` and
`.../advisor.ts`; the executor in `src/services/aiTools.ts`.

## Models

Model routing is defined in `src/services/ai/models.ts`:

| Key | Primary | Fallback chain | Use |
| --- | --- | --- | --- |
| `chat` | `gemini-3.5-flash-lite` | `gemini-3.1-flash-lite` → `gemini-3.6-flash` | Interactive chat and agent turns; MINIMAL thinking |
| `quality` | `gemini-3.5-flash` | `gemini-3.5-flash-lite` → `gemini-3.6-flash` | Structured requests; LOW thinking by default |

On 404, 429 or 503, the provider tries one next model and remembers the selection. Cached model IDs from older releases are invalidated by the v2 cache key. The chat tier explicitly uses MINIMAL thinking; the quality tier uses LOW thinking by default. Gemini 3.5 Flash-Lite supports up to 1,048,576 input tokens and 65,536 output tokens. Google API quotas remain controlled by the AI Studio project tier.

## Cost controls

| Control           | Implementation                                                             |
| ----------------- | -------------------------------------------------------------------------- |
| Rate limit        | 30 requests / 60 s per guest IP hash and 60 requests / 60 s per verified user via atomic Supabase RPCs |
| Auth              | Supabase PostgREST validates the signed access token; the RPC rejects anonymous/unverified accounts   |
| Model allow-list  | Vercel proxy accepts only the model IDs listed by the active client         |
| Request bounds    | JSON only, 2 MiB body cap, 55 s upstream deadline                           |
| Bounded context   | `list_components` returns ≤12 compact rows, not full specs                 |
| Bounded rounds    | 5 tool rounds (builder), 4 (advisor)                                       |
| Caching           | `ai_fps_estimates` caches fallback FPS per (GPU, game, resolution, preset) |
| Prompt discipline | System instructions cap answer length (~180 words for the advisor)         |
| Token caps        | `maxOutputTokens` per action in the proxy                                  |

## Fallback ladder

1. **Gemini healthy** → agent produces the result.
2. **Gemini returns an invalid build** → one corrective re-prompt.
3. **Still invalid / rate-limited / timeout / 5xx** → `fallbackBuild()`
   (deterministic, DB-sourced) and the UI shows
   _"AI temporarily unavailable — showing a rule-based build"_.
4. **No `GEMINI_API_KEY`** → the same fallback, with `degradedReason:
'AI is not configured on the server'`.

The user always gets a build. Nothing crashes.

## Streaming

`geminiProvider.ts` opens a raw same-origin `fetch` through the Vercel proxy
(Supabase's `functions.invoke` buffers) and parses `data: {json}\r\n\r\n`
frames. The Gemini upstream uses CRLF, and
the parser normalises it — an early version split on `\n\n` and silently
yielded zero chunks.

Events: `start` → `token`* → (`tool_call`)* → `done`. `AbortController` is
threaded from the UI through to the upstream request, so "Stop" actually stops
the generation.

## Prompt files

| File                        | Contract                                                            |
| --------------------------- | ------------------------------------------------------------------- |
| `prompts/buildGenerator.ts` | tools, system rules, user turn, corrective re-prompt                |
| `prompts/advisor.ts`        | prose style, `[[component:id                                        | Name]]` citation markers, contextual suggestions |
| `prompts/buildDoctor.ts`    | JSON schema, "interpret, never recompute", candidate-ID restriction |
| `prompts/perfEstimator.ts`  | JSON schema for absolute FPS per game                               |

Each file documents its contract at the top so the invariants survive edits.
