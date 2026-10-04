# AI features: progress

Scratch file. Delete it when these are done.

## The key is on the server, not in the browser

- [x] `netlify/functions/ai.mjs` holds GROQ_API_KEY, read from host env vars
- [x] The browser POSTs {system, question} to /api/ai and holds nothing secret
- [x] A check that the request carries nothing credential-shaped
- [x] A check that this browser's storage holds nothing credential-shaped
- [x] No logging of request bodies - people's code passes through
- [x] A size cap, so nobody uses it as a free relay
- [x] `/api/` excluded from the service worker as well as being a POST
- [x] `netlify.toml` so the deploy needs no dashboard fiddling
- [!] Deleted with the key: the dialog, the provider menu, the local Ollama option

## Whatever went wrong gets shown

- [x] The function passes the upstream status through instead of flattening it
- [x] Six distinct messages: spent allowance, refused key, AI switched off,
      withdrawn model, no endpoint at all, too much code
- [x] A failed problem request brings the console into view first

## Tested without a key

- [x] askModel seam in the browser - 174 core checks
- [x] test/functions.js in node - 11 checks, fetch replaced
- [x] `CASES=functions` runs the node phase alone
- [x] 8 mutations on the proxy path, all caught
- [x] Full suite green - 218 checks

## The live call - done, after it failed once

- [x] A key in `.env`, gitignored, with `.env.example` committed as the template
- [x] `dev.mjs` - serves the files and runs the function in process, so there is a
      way to exercise `/api/ai` locally at all
- [!] **The first real request 404'd.** `llama-3.3-70b-versatile` came from Groq's
      documentation and had been withdrawn. A `GET /openai/v1/models` returned
      eleven models, no llama among them.
- [x] Model is now `openai/gpt-oss-120b`, taken from that list, not from prose
- [x] MAX_TOKENS 2000 -> 3000: it reasons before answering and the thinking is
      charged against the same budget (910 thinking + 384 saying, for a problem)
- [x] Both prompts tried for real - an error explained in 721ms, a practice problem
      set in 3.3s, JSON clean, the stub left unsolved as instructed
- [x] Browser -> function -> Groq end to end through `dev.mjs`: 200 with an answer,
      405 on a GET, 400 on an empty question
- [x] 11 node checks still pass with the new model

## Still open

- [ ] Nothing known. The whole path has now been run end to end with a real key.
- [ ] Worth deciding: whether a withdrawn model should fall back to a second one
      automatically, rather than only reporting it. Not built - it is a judgement
      call about hiding a problem versus surviving it.
