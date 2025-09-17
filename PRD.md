# Lit Review Screening Assistant — PRD v2.1 (Prototype)

## 0) One‑line Summary

An auditable, privacy‑first screening assistant that imports Zotero exports, applies user‑defined inclusion/exclusion rules plus an LLM triage, and outputs tagged decisions and justifications back to Zotero formats.

---

## 1) Goals & Non‑Goals

**Goals**

* Cut first‑pass screening time by 50–80% without sacrificing recall.
* Make decisions reproducible: every include/exclude has traceable criteria, model version, and evidence snippets.
* Round‑trip with Zotero: import `.bib` and export `.bib`/`.ris` with tags and notes.
* Provide filters and batch ops to accelerate adjudication.

**Non‑Goals**

* Full‑text appraisal or meta‑analysis grading.
* Automatic PDF fetching/scraping from publishers.
* Replacing human judgment in borderline cases.

---

## 2) Users & Use Cases

**Primary user**: Researcher conducting a structured literature review.

**Core use cases**

1. Import an exported Zotero `.bib` and see de‑duplicated records.
2. Define inclusion/exclusion criteria (structured + free‑text).
3. Run machine triage (deterministic rules → LLM → decision).
4. Manually review Mays and Excludes with low confidence.
5. Export decisions with tags and notes back to Zotero‑friendly formats.

---

## 3) Success Metrics (Evidence‑based)

* **Recall on sentinel set** ≥ 95% (relative recall against a gold subset).
* **Precision (post‑adjudication)** ≥ 70% for Includes.
* **Time per record**: median ≤ 15s for triage; ≤ 60s for adjudication.
* **Reproducibility**: identical inputs + model/criteria version yield identical decisions within stochastic tolerance (<1% variance when using LLM with fixed seed/temp).

---

## 4) Data Model

**Record**

* `id`: stable key (prefer DOI; else normalized title+year hash)
* `title`: string
* `abstract`: string
* `authors[]`: strings
* `year`: number
* `venue`: string
* `type`: enum {journal-article, conference-paper, review, editorial, thesis, report, other}
* `keywords[]`: strings (from `keywords` field or `tags`)
* `notes`: string (from `annote`/`notes`)
* `identifiers`: { doi?, pmid?, url? }
* `raw`: original BibTeX block for lossless export

**Decision**

* `status`: enum {Include, Exclude, Maybe}
* `confidence`: 0–1
* `justification`: short string referencing criteria keys
* `evidence`: array of matched snippets with offsets (title/abstract/keywords)
* `criteria_version`: semver
* `model_version`: model name + hash
* `timestamp`: ISO
* `tags[]`: {"Include"|"Exclude"|"Maybe"}+custom

**Criteria**

* `inclusion[]`: array of rule objects (see DSL)
* `exclusion[]`: array of rule objects
* `logic`: how to combine (default: all inclusion must pass; any exclusion fails)
* `version`: semver
* `name`: string

---

## 5) Import/Parsing

* Accept `.bib` (Better BibTeX or standard BibTeX). Future: `.ris`, `.nbib`.
* Parse with robust BibTeX parser; preserve unknown fields under `raw`.
* Normalize whitespace, de‑HTML entities, strip LaTeX wrappers in titles/abstracts.
* Deduplicate using DOI, then normalized title trigram + year.
* Map BibTeX fields:

  * `title` → `title`
  * `abstract` or `abstract_note` → `abstract`
  * `year` or `date` → `year`
  * `keywords`/`keyword` → `keywords[]`
  * `note`/`annote` → `notes`
  * `journal`/`booktitle` → `venue`
  * `doi`, `url` → `identifiers`

---

## 6) Criteria DSL (Deterministic Rules)

A minimal, readable rule format that compiles to boolean checks. Stored as JSON or YAML.

**Schema**

```yaml
inclusion:
  - id: adult_population
    any:         # record must match at least one clause in this rule
      - field: abstract
        contains: ["adult", "postsecondary", "college", "university"]
      - field: keywords
        intersects: ["adult", "postsecondary"]
  - id: speaking_outcome
    any:
      - field: abstract
        contains: ["speaking", "oral proficiency", "conversation", "pronunciation"]
  - id: behavioral_mechanism
    any:
      - field: abstract
        contains: ["behavioral", "nudge", "self-regulation", "habit", "feedback loop"]
  - id: valid_design
    any:
      - field: type
        in: ["journal-article", "conference-paper"]

exclusion:
  - id: wrong_population
    any:
      - field: abstract
        contains: ["K-12", "elementary", "primary school", "children"]
  - id: no_outcome
    all:
      - field: abstract
        not_contains: ["outcome", "effect", "improve", "impact", "evaluation"]
  - id: opinion_only
    any:
      - field: type
        in: ["editorial", "commentary"]
```

**Operators**: `contains`, `not_contains`, `in`, `not_in`, `intersects` (with keywords), `regex`.

**Combiner**: All inclusion rules must pass; any exclusion rule that passes triggers Exclude. Tunable per project.

---

## 7) Decision Engine (Pipeline)

1. **Deterministic pass**

   * Apply inclusion then exclusion DSL. If hits exclusion early, label `Exclude (conf=0.99)` with justification.
   * If passes inclusion strongly (≥ N matched tokens across ≥ M rules), label `Include (conf≈0.9)` without LLM.
2. **LLM triage pass** (only for undecided)

   * Summarize fields to a compact context window (title, 800‑char abstract, keywords, type).
   * Prompt LLM to output a JSON block with fields: `status`, `confidence`, `rationale`, `criteria_refs`.
   * Constrain with a Pydantic schema; reject outputs that don’t validate and reprompt once.
3. **Human‑in‑the‑loop**

   * Items with `Maybe` or `confidence < θ` go to the review queue.
   * Inline controls to flip status and edit justification; all edits are logged.

**Priorities**

* **Minimize false negatives** on Includes. Favor recall over precision during triage.
* Route ambiguous records to human quickly.

---

## 8) UI/UX

**Screens**

* Upload & Parse: drag‑and‑drop `.bib`. Show parse count, dedupe count, missing abstracts.
* Criteria Builder: YAML/JSON editor with linting + quick templates. Version selector.
* Triage View: one‑by‑one screen with keyboard shortcuts: `1=Include`, `2=Exclude`, `3=Maybe`.
* Evidence Panel: highlight matched phrases per rule; show model decision, confidence, and rationale.
* Filters & Batches: Include/Exclude/Maybe, by keyword, by year, by confidence range.
* Export: choose format and field mapping; preview first 5 records.

**Quality of life**

* Undo last N actions.
* Sticky notes per project.
* Session autosave.

---

## 9) Export & Round‑trip

* **BibTeX**: write tags into `keywords` and decision into `keywords` + `annote` note block.
* **RIS**: write decisions into `KW` and justification into `N1`.
* Include a hidden machine section in notes:

  * `Decision: Include|Exclude|Maybe`
  * `CriteriaVersion: x.y.z`
  * `Model: gpt-oss-120b@OpenRouter`
  * `Confidence: 0.00–1.00`
  * `Evidence: <snippets>`
* Optionally export CSV for audit.

---

## 10) Auditability & Reproducibility

* Log: criteria version, model id/hash, temperature, seed, prompt template version, timestamp, and input checksum per record.
* Deterministic rules are re‑runnable; LLM path supports fixed `temperature=0` and seeded decoding when available.
* Provide an **Audit Report** (CSV) with diffs between criteria versions.

---

## 11) Privacy & Security

* BYO key; never persist keys server‑side in Phase A. In Phase B, store via Vercel Encrypted Env.
* No vendor data retention: set appropriate headers; offer local‑only mode that disables LLM calls.
* Redact emails and PII from logs.
* CORS restricted to deployed domains; CSRF protection for actions.

---

## 12) Performance & Cost

* Deterministic stage handles ≥ 80% of obvious cases.
* Batch LLM calls with rate limiting; cap context to ≤ 1.5k tokens.
* Estimated LLM spend: \~0.5–1.0¢ per undecided record on 120B class model; reduce via aggressive rule tuning.

---

## 13) Quality Assurance

* **Sentinel Set**: curate 50–100 known‑positive papers spanning edge cases. Compute **relative recall**: `|LLM∩Sentinel| / |Baseline∩Sentinel|`. Target ≥ 0.95.
* **Inter‑rater reliability**: Cohen’s κ between machine and human for a 100‑item sample; target κ ≥ 0.6 before trusting batch mode.
* **Drift watch**: alert when model version changes or recall dips below threshold on nightly sample.

---

## 14) Risks & Mitigations

* **LLM hallucination or over‑inclusion** → Constrain output schema; show evidence highlights; low‑confidence → human.
* **Garbage‑in abstracts** → Dedupe + heuristics for missing/short abstracts; fall back to deterministic only.
* **Vendor API instability** → Model adapter interface + retry/backoff + local‑only mode.

---

## 15) Architecture

**Frontend**: Next.js App Router, React Server Components, Tailwind, shadcn/ui.

**Backend**: Next.js Route Handlers (Edge for parse, Node for LLM). Zod/Pydantic schema validation. Optional SQLite (Turso) for session state.

**Services**

* Parser service: parse/dedupe/normalize `.bib`.
* Rules engine: compile DSL to predicates.
* LLM adapter: OpenRouter client; pluggable model key.
* Exporter: format‑specific writers (BibTeX/RIS/CSV).

**Observability**: minimal structured logs; anonymized metrics.

---

## 16) Build Order & Environments

**Phase A — Local‑first**

* Parse `.bib`, display records.
* Criteria DSL + deterministic engine.
* Manual triage UI + filters.
* Export `.bib` with tags/notes.
* BYO OpenRouter key for optional LLM triage.

**Phase B — Vercel**

* Deploy UI/API.
* Secure env vars (`OPENROUTER_API_KEY`).
* CORS restrict to prod domain.
* Add audit report and batch processing.

**Phase C — QA**

* Add sentinel set harness; compute recall and κ. Calibrate thresholds.

---

## 17) API & Storage Surfaces

* `POST /api/import` → upload `.bib`, returns parsed records + import id.
* `POST /api/triage` → run rules+LLM on import id.
* `POST /api/export` → returns `.bib`/`.ris`/`.csv`.
* `GET /api/audit/:importId` → CSV of decisions.
* Storage: ephemeral in‑memory or SQLite; no PDFs stored.

---

## 18) Prompt Contract (LLM)

**System**: You are a rigorous screening assistant. Obey criteria strictly. Prefer recall; output JSON only.

**User**: `{title, abstract, keywords[], type, criteria_vX.Y.Z}`

**Output JSON Schema**

```json
{
  "status": "Include|Exclude|Maybe",
  "confidence": 0.0,
  "rationale": "<<=500 chars, cite criteria ids>>",
  "criteria_refs": ["adult_population", "speaking_outcome"]
}
```

---

## 19) Keyboard Shortcuts

* `J/K` next/prev record; `1` Include, `2` Exclude, `3` Maybe; `E` edit criteria; `.` toggle highlights.

---

## 20) Open Questions

* Should we support blinded dual screening workflows now or later?
* Do we need a PRISMA flow export artifact at this stage?
* Add active learning (hint words from Includes) to improve deterministic rules?

---

## 21) Appendix A — Field Mapping Cheatsheet (Zotero BibTeX)

* Decision tags: `keywords = {Include, <project>, <custom>}`
* Justification: `annote = {Decision: Include; CriteriaVersion: 1.0.0; Model: gpt-oss-120b@OpenRouter; Confidence: 0.84; Evidence: "…snippet…"}`

---

## 22) Appendix B — Sample Criteria Template (YAML)

```yaml
name: ESL Behavior Review v1
version: 1.0.0
logic:
  require_all_inclusion: true
  any_exclusion_trumps: true
inclusion:
  - id: adult_population
    any:
      - {field: abstract, contains: ["adult", "postsecondary", "college", "university"]}
  - id: speaking_outcome
    any:
      - {field: abstract, contains: ["speaking", "oral proficiency", "conversation", "pronunciation", "fluency"]}
  - id: behavioral_mechanism
    any:
      - {field: abstract, contains: ["behavioral", "self-regulation", "habit", "nudg", "feedback loop", "coaching"]}
  - id: valid_design
    any:
      - {field: type, in: ["journal-article", "conference-paper"]}
exclusion:
  - id: k12_population
    any:
      - {field: abstract, contains: ["K-12", "elementary", "primary", "secondary"]}
  - id: opinion
    any:
      - {field: type, in: ["editorial", "commentary", "magazine"]}
  - id: no_empirical_outcome
    all:
      - {field: abstract, not_contains: ["evaluate", "improv", "effect", "impact", "experiment", "trial"]}
```

---

## 23) Appendix C — Dev Notes

* Use `bibtex-parse` (or ts equivalent) with resilience to mixed encodings.
* Implement fuzzy contains with stemming and casefold, not raw substring.
* Evidence highlights via char spans for matched tokens to present in UI.
* Model adapter interface so we can swap to smaller local models when possible.