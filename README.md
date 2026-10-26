# Conforme

**Check it before you sign.** Take one photo of the morning's supplier delivery notes. Conforme separates each note, reads every money number twice, and checks every euro in plain code. When something is off, an agent goes back to the paper: it picks what to re-read zoomed in, pulls the price history or the order, and closes the case citing its evidence, which code then checks. Before any claim reaches a supplier, every number it rests on has been confirmed on the paper. What you get is ready to use: the line to write on the note before signing, and the message to the supplier with the proof cut from their own note.

**Live:** https://conforme-mu.vercel.app · try the recorded samples (no wait), ask the month sample a question by voice, or take a photo of your own notes.

Built for Meta's Global AI Developer Hackathon (Oct 26 to Nov 4, 2026), problem statement *Build for Your World*. All code in this repository was written during the event; the first commit is from Oct 26, 2026, after the kickoff.

## Why
My mother does the paperwork at our family restaurant in Gijón, Spain. Every morning there is a pile of delivery notes and a driver waiting for a signature, and nobody has time to check them line by line. The first tool I built for her has read 715 delivery notes since March and caught 103 price rises worth €1,876. Spain has about 263,500 bars and restaurants, and most are independents with no purchasing department.

## Measured, not claimed
On 33 real delivery notes from that restaurant (20 of them scanned sideways, faded dot-matrix prints, two VAT rates on one page), with the product exactly as it runs, two full runs of the current version (Oct 26):

| | |
|---|---|
| Lines read to the cent | **97.4%** (150 of 154; 96.1% and 98.7%) |
| Complete lines (quantity, price, amount, VAT) | 94.9% (150 of 158) |
| Perfect notes | 30 and 31 of 33 |
| Note total exact | 31 of 31 in both runs |
| Silent OKs (ALL GOOD stamp on a note with an error) | **0 and 0** |
| Sent to review, rightly / needlessly | 3 and 2 / 1 and 0 |
| Time per note (median, latest run) · cost per note | 23.0 s · $0.037 |

Every version is published on `/eval`, including the one that had a silent OK (see below). The real notes never leave my laptop; only aggregate numbers are in `eval/results/`.

## The agent
Muse Spark 1.3 through the Responses API, with tools that code runs. It is used twice per note when needed:

- **Investigator**, when a reading is in doubt (a line that doesn't add up, two readings that disagree, an unreadable field). It decides what to look at and closes with a verdict: misread cell, supplier error, reading confirmed, or "a person should look".
- **Claim file**, when there is money at stake. Before any money is asked of a supplier, it re-reads the claimed line zoomed in and pulls the record it is compared against (price history or order).

Tools: `releer_celda`, `releer_fila`, `releer_total` (crop, zoom 2×, read again), `historial_precio`, `pedido` (code lookups), `recontar_filas`. Every result is numbered evidence with its crop. Up to 4 tool calls per note; calls asked for in one turn run in parallel; when time runs out the agent gets a close-only turn (the Meta API only supports `tool_choice: "auto"`, so only the closing tool is offered).

What code accepts as evidence:
- a corrected cell needs a zoomed re-read showing exactly that text, and the line must then add up;
- a supplier error needs the printed amount confirmed by a re-read, no re-read contradicting quantity or price, and no other number on the row that makes the line add up (pieces against weight);
- a price rise or shortage is claimed only if the zoomed re-read shows the same price and quantity; a re-read that disagrees holds the claim back, even if the agent does not cite it;
- a closing that cites evidence that does not exist is rejected.

The claim message, the line to write on the note and the proof image are templates filled with code's numbers. Nothing is sent without the user.

## How it uses Meta's models
| Step | Model | What it does |
|---|---|---|
| Split and straighten | **SAM 3.1** | Finds every note in one photo ("sheet of paper"), pixel mask; code computes the minimum rotated rectangle and straightens it |
| Read with boxes | **Muse Spark 1.3** | Strict JSON: every field copied as printed, with its box on a 0-1000 grid; reports the page rotation, code turns it upright |
| Second, independent reading | **Muse Spark 1.3** | Re-reads the enlarged line table and, in parallel, the VAT rows and the total, without seeing the first reading. Any disagreement is a doubt |
| Investigate, confirm claims | **Muse Spark 1.3 with tools** | The two agent phases above |
| Ask | **Muse Voice Transcribe + Muse Spark** | Speech to text, then a closed-set intent with suppliers and products taken from the session; code computes the answer and lights the lines |
| Test scenes | **Muse Image** | The kitchen-counter backgrounds of the fictional samples (labelled) |

What the model never decides: any figure, whether a line is right, the reference price, duplicates, unit conversions, which lines light up, the stamp, or the text a supplier receives.

Standard API mode only. `src/lib/meta/models.ts` is an allowlist that refuses any `-contributor` model, with a test.

## Private mode (open weights, not measured yet)
The same reading can run on an open-weight Meta model, so supplier prices never leave hardware the restaurant controls. Setting `PRIVATE_MODEL_BASE_URL` routes every Muse Spark call (reading, second reading, both agents, question intent) through an adapter that speaks OpenAI-compatible chat completions (`src/lib/meta/privado.ts`); SAM and voice stay on the Meta API. The default private model is Muse Glimmer 30B (`meta-models/Muse-Glimmer-30B-GGUF`, Apache 2.0) on llama.cpp; Muse Spark Open on Baseten is configured the same way. The adapter is verified against Meta's own chat completions endpoint (a reading of a fictional note parsed and matched, and a tool round trip). It has not been run on Glimmer yet: the model needs about 19 GB and my laptop could not spare it tonight, and the Baseten credits have not arrived. When it runs, its results go to `eval/results/` with the model in the tag, next to Muse Spark's.

## What I learned (and fixed)
- **The model invented a price that added up.** It read €1.175 where the paper says €0.950, because 24 × 1.175 is exactly the €28.20 charged. The second, independent reading exists because of this.
- **A silent OK, by one cent.** In one run a blurry ticket was stamped ALL GOOD with its VAT read as 25.59 and its total as 147.42; the paper says 25.58 and 147.41. The two agreed with each other and the VAT was within rounding. The table was read twice; the tax summary was not. Now it is, and in the next two runs the total was exact on 31 of 31.
- **It nearly accused a supplier wrongly.** A note prints pieces (3 U) and weight (11.081 kg); the agent took the pieces and saw a €111.52 overcharge. Code now forbids that verdict when another printed number makes the line add up.
- **A box with no height hid a whole row.** The first reading put one row's box above row 1 with zero height; the table crop cut that row out. Code now re-places impossible boxes from their neighbours, and a tool that cannot find its line looks again at the whole table.
- **Slow API, no verdict.** With the API slow, three sequential zoomed re-reads ran past the time budget and the agent never closed. Tools of one turn now run in parallel, and at the deadline the agent gets a closing turn.
- **Counting crates with SAM wasn't reliable** (exact on 5 of 23 counts on public photos), so it is not in the product.

## Run it
```bash
npm ci
echo "MODEL_API_KEY=..." > .env.local      # Meta Model API key (standard mode)
npm run dev                                # http://localhost:3000
npx vitest run                             # 70 tests
```
Samples work without a key (recorded runs in `public/replays`). Live reads and questions need the key; optional `UPSTASH_REDIS_REST_URL`/`TOKEN` for rate limits in production.

Measurement: `eval/real.mts --investigar` (needs the private set via `REAL_EVAL_DIR`), `eval/combinar.mts` (mean and range of repeated runs), `eval/synthetic.mts` and `eval/cajas.mts` (fictional notes with true boxes), `scripts/gen/render.mts` (fictional note generator), `scripts/grabar-muestra.mts` and `scripts/grabar-mes.mts` (recorded samples), `scripts/smoke-privado.mts` (private mode check).

## Privacy
Real delivery notes are used only to measure accuracy, on my laptop. They are never committed, shown or uploaded anywhere except the Meta Model API in standard mode. A pre-commit hook and CI block real data; the aggregate writer refuses anything that is not a number or a metric name. All samples are fictional (Casa Nela, fake tax IDs B0000000x) and labelled.

## License
MIT
