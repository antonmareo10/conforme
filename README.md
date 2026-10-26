# Conforme

**Check it before you sign.** Take one photo of the morning's supplier delivery notes. Conforme separates each note, reads every line, checks every euro in plain code, investigates what doesn't add up, and drafts the claim to the supplier. Every number on screen points to the exact place on the paper it came from.

**Live:** https://conforme-mu.vercel.app · try the recorded samples (no wait), or take a photo of your own notes.

Built for Meta's Global AI Developer Hackathon (Oct 26 to Nov 4, 2026), problem statement *Build for Your World*. All code in this repository was written during the event; the first commit is from Oct 26, 2026, after the kickoff.

## Why
My mother does the paperwork at our family restaurant in Gijón, Spain. Every morning there is a pile of delivery notes and nobody has time to check them line by line before signing. The first tool I built for her has read 715 delivery notes since March and caught 103 price rises worth €1,876. Spain has about 263,500 bars and restaurants, and most are independents with no purchasing department.

## Measured, not claimed
On 33 real delivery notes from that restaurant (20 of them scanned sideways, faded dot-matrix prints, two VAT rates on one page), with the product exactly as it runs:

| | |
|---|---|
| Lines read to the cent | **98.7%** (76 of 77) |
| Complete lines (quantity, price, amount, VAT) | 94.9% (75 of 79) |
| Perfect notes | 30 of 33 |
| Silent OKs (ALL GOOD stamp on a note with an error) | **0** |
| Sent to review, rightly / needlessly | 3 / 0 |
| Time per note (median) · cost per note | 16.4 s · $0.029 |

The real notes never leave my laptop; only aggregate numbers are in `eval/results/`. The full method, the version history and what failed along the way are on the `/eval` page.

## How it uses Meta's models
| Step | Model | What it does |
|---|---|---|
| Split and straighten | **SAM 3.1** | Finds every note in one photo ("sheet of paper"), pixel mask; code computes the minimum rotated rectangle and straightens it |
| Read with boxes | **Muse Spark 1.3** | Strict JSON: every field copied as printed, with its box on a 0-1000 grid; reports the page rotation, code turns it upright |
| Second, independent reading | **Muse Spark 1.3** | Re-reads the enlarged line table without seeing the first reading; locates each row (20/20 vs 12-17/20 from the first pass) and copies every number again. Any disagreement is a doubt |
| Investigate | **Muse Spark 1.3 with tools** | An agent picks what to check: re-read a zoomed cell, row or total, price history, the order, recount rows. Max 4 steps; every result is numbered evidence with its crop |
| Ask | **Muse Voice Transcribe + Muse Spark** | Speech to text, then a closed-set intent with suppliers and products taken from the session; code computes the answer and lights the lines |
| Test scenes | **Muse Image** | The kitchen-counter backgrounds of the fictional samples (labelled) |

What the model never decides: any figure, whether a line is right, the reference price, duplicates, unit conversions, which lines light up, or the stamp. Verdicts are validated by code: a correction needs a re-read showing that text and a line that then adds up; a supplier error needs the printed amount confirmed and no other number on the row explaining it.

Standard API mode only. `src/lib/meta/models.ts` is an allowlist that refuses any `-contributor` model, with a test.

## What we learned (and fixed)
- **The model invented a price that added up.** It read €1.175 where the paper says €0.950, because 24 × 1.175 is exactly the €28.20 charged. The second, independent reading exists because of this.
- **It nearly accused a supplier wrongly.** A note prints pieces (3 U) and weight (11.081 kg); the agent took the pieces and saw a €111.52 overcharge. Code now forbids that verdict when another printed number makes the line add up.
- **Counting crates with SAM wasn't reliable** (exact on 5 of 23 counts on public photos), so it is not in the product.

## Run it
```bash
npm ci
echo "MODEL_API_KEY=..." > .env.local      # Meta Model API key (standard mode)
npm run dev                                # http://localhost:3000
npx vitest run                             # 36 tests
```
Samples work without a key (recorded runs in `public/replays`). Live reads need the key; optional `UPSTASH_REDIS_REST_URL`/`TOKEN` for rate limits in production.

Measurement scripts: `eval/real.mts` (needs the private set via `REAL_EVAL_DIR`), `eval/synthetic.mts` and `eval/cajas.mts` (fictional notes with true boxes), `scripts/gen/render.mts` (fictional note generator), `scripts/grabar-muestra.mts` and `scripts/grabar-mes.mts` (recorded samples).

## Privacy
Real delivery notes are used only to measure accuracy, on my laptop. They are never committed, shown or uploaded anywhere except the Meta Model API in standard mode. A pre-commit hook and CI block real data; the aggregate writer refuses anything that is not a number or a metric name. All samples are fictional (Casa Nela, fake tax IDs B0000000x) and labelled.

## License
MIT
