# Literature Screening Assistant

AI-assisted triage workflow for large BibTeX exports. Upload your Zotero export, configure inclusion/exclusion criteria, and run sequential screening with OpenRouter models (xAI Grok-4 fast/free by default or OpenAI GPT-OSS-120B) or Google Gemini 2.5 Pro.

## Features
- **Sequential record triage** with live progress, warnings, and exportable decisions (CSV, JSON, annotated BibTeX).
- **Flexible criteria editor**: paste human-readable inclusion/exclusion rules; deterministic heuristics backstop LLM failures.
- **Provider selection & reasoning control**: choose OpenRouter or Gemini, pick an OpenRouter model with contextual guidance, adjust reasoning effort where supported, and store keys locally.
- **Managed hosted option**: sign in with Google, purchase Stripe-powered credits, and review per-run token usage plus costs in your managed history.
- **Traceable outputs**: every record captures status, confidence, matched rules, model, and rationale.

## Getting Started
1. Install dependencies: `npm install`
2. Run the app: `npm run dev`
3. Open `http://localhost:3000` and upload a BibTeX export (the repository ships with `Exported Items.bib` for testing).

### Configuration
- Copy `.env.example` to `.env.local` and populate the required secrets before starting the server. Detailed steps for Google
  Cloud credentials, service-account encoding, and Stripe keys live in [docs/configuration.md](docs/configuration.md).

### API Keys
- **OpenRouter**: generate a key at [openrouter.ai/keys](https://openrouter.ai/keys). Ensure your privacy settings allow public models and the xAI Grok-4 fast or GPT-OSS-120B endpoints.
- **Data policy overrides**: The credentials panel lets you keep the request on your account's default privacy mode (no header) or send a custom `X-OpenRouter-Data-Policy` value such as `permissive` for individual runs.
- **Google Gemini**: create a key via [Google AI Studio](https://aistudio.google.com/app/apikey) or Cloud Generative AI.

Keys are stored only in your browser (localStorage) and sent with each triage request when you click "Save locally."

## Usage Flow
1. Upload BibTeX → records load into memory; you can inspect counts immediately.
2. Configure provider, usage mode, and API key.
   - BYOK keeps your OpenRouter key in local storage and forwards it only when you run triage.
   - Managed mode unlocks after signing in with Google and maintaining a positive managed balance. Stripe top-ups start at $5 (credited as $2.50 of hosted usage) and each managed run debits the ledger automatically.
   - OpenRouter users start on xAI Grok-4 fast (free) by default but can switch to GPT-OSS-120B when reasoning support is required. A model picker explains token limits and whether reasoning is available; selections persist locally once you click **Save locally**.
3. Paste or tweak inclusion/exclusion criteria; deterministic heuristics update automatically.
4. Click **Start LLM triage pass** to process entries sequentially. Progress updates one record at a time.
5. Review results, warnings, and export decisions as needed.

### Managed credits & history

- Managed credits convert paid USD to internal usage at a 50% rate (e.g., a $5 top-up becomes $2.50 of hosted credit) and can be purchased through Stripe Checkout directly from the banner.
- The Account banner shows your current balance, an estimated number of remaining Grok-4 fast runs, and links to add funds or open the Stripe customer portal.
- Every managed pass records token usage, estimated and actual costs, and balance changes in Firestore; the in-app history panel surfaces these entries for quick audits.
- BYOK API keys never leave your browser. Managed requests share only the token/cost metadata required for billing and Stripe audits.

## Testing
- Unit & integration tests: `npm test`

## Roadmap Ideas
- Persist in-progress runs for long screening sessions.
- Add evaluation dashboards comparing reasoning efforts and providers.
- Surface confidence calibration metrics and heuristic/LLM agreement scores.

---

© 2025 Literature Screening Assistant. Built with OpenAI Codex.
