# Literature Screening Assistant

AI-assisted triage workflow for large BibTeX exports. Upload your Zotero export, configure inclusion/exclusion criteria, and run sequential screening with OpenRouter GPT-OSS-120B or Google Gemini 2.5 Pro.

## Features
- **Sequential record triage** with live progress, warnings, and exportable decisions (CSV, JSON, annotated BibTeX).
- **Flexible criteria editor**: paste human-readable inclusion/exclusion rules; deterministic heuristics backstop LLM failures.
- **Provider selection & reasoning control**: choose OpenRouter or Gemini, set reasoning effort (none/low/medium/high) for GPT-OSS-120B, and store keys locally.
- **Traceable outputs**: every record captures status, confidence, matched rules, model, and rationale.

## Getting Started
1. Install dependencies: `npm install`
2. Run the app: `npm run dev`
3. Open `http://localhost:3000` and upload a BibTeX export (the repository ships with `Exported Items.bib` for testing).

### API Keys
- **OpenRouter**: generate a key at [openrouter.ai/keys](https://openrouter.ai/keys). Ensure your privacy settings allow public models and the GPT-OSS-120B endpoint.
- **Google Gemini**: create a key via [Google AI Studio](https://aistudio.google.com/app/apikey) or Cloud Generative AI.

Keys are stored only in your browser (localStorage) and sent with each triage request when you click “Save locally.”

## Usage Flow
1. Upload BibTeX → records load into memory; you can inspect counts immediately.
2. Configure provider and API key.
   - OpenRouter users may adjust reasoning effort (higher = better deliberation, more latency/tokens).
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
