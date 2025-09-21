# Literature Screening Assistant

AI-assisted triage workflow for large BibTeX exports. Upload your Zotero export, configure inclusion/exclusion criteria, and run sequential screening with OpenRouter models (GPT-OSS-120B or xAI Grok-4 fast/free) or Google Gemini 2.5 Pro.

## Features
- **Sequential record triage** with live progress, warnings, and exportable decisions (CSV, JSON, annotated BibTeX).
- **Flexible criteria editor**: paste human-readable inclusion/exclusion rules; deterministic heuristics backstop LLM failures.
- **Provider selection & reasoning control**: choose OpenRouter or Gemini, pick an OpenRouter model, adjust reasoning effort where supported, and store keys locally.
- **Traceable outputs**: every record captures status, confidence, matched rules, model, and rationale.

## Getting Started
1. Install dependencies: `npm install`
2. Run the app: `npm run dev`
3. Open `http://localhost:3000` and upload a BibTeX export (the repository ships with `Exported Items.bib` for testing).

### API Keys
- **OpenRouter**: generate a key at [openrouter.ai/keys](https://openrouter.ai/keys). Ensure your privacy settings allow public models and the GPT-OSS-120B or xAI Grok-4 fast endpoints.
- **Data policy overrides**: The credentials panel lets you keep the request on your account's default privacy mode (no header) or send a custom `X-OpenRouter-Data-Policy` value such as `permissive` for individual runs.
- **Google Gemini**: create a key via [Google AI Studio](https://aistudio.google.com/app/apikey) or Cloud Generative AI.

Keys are stored only in your browser (localStorage) and sent with each triage request when you click “Save locally.”

## Usage Flow
1. Upload BibTeX → records load into memory; you can inspect counts immediately.
2. Configure provider and API key.
   - OpenRouter users can select GPT-OSS-120B or xAI Grok-4 fast (free). Reasoning effort is available only for GPT-OSS-120B.
3. Paste or tweak inclusion/exclusion criteria; deterministic heuristics update automatically.
4. Click **Start LLM triage pass** to process entries sequentially. Progress updates one record at a time.
5. Review results, warnings, and export decisions as needed.

## Testing
- Unit & integration tests: `npm test`

## Roadmap Ideas
- Persist in-progress runs for long screening sessions.
- Add evaluation dashboards comparing reasoning efforts and providers.
- Surface confidence calibration metrics and heuristic/LLM agreement scores.

---

© 2025 Literature Screening Assistant. Built with OpenAI Codex.
