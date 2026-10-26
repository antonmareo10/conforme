# Day 0 (Oct 26, 2026): what the Meta Model API actually does

Measured from Spain with the event key, standard mode. Scripts in `scripts/smoke-*.mjs`. Real delivery notes were sent to the API only; nothing from them is stored in this repo.

| Question | Result | Decision |
|---|---|---|
| Does the API work from Spain? | `GET /v1/models` 200; `muse-spark-1.3`, `sam-3.1`, `muse-voice-transcribe-1.0`, `muse-image-1.0`, `muse-wonder-1.0` listed. Rate limit 3,000 RPM / 4M TPM | Go |
| Strict JSON schema with nulls | `type: ["string","null"]` and nullable objects accepted with `strict: true` | Nullable fields, no sentinels |
| Reading a real thermal ticket (2048 px, effort low) | All header fields, the line, VAT base/amount and total exact. ~4.1k input tokens, ~1.7k output (1.1k reasoning), ~10 s | Effort `low` as starting point; sweep later |
| Reading a scan lying sideways (90°) | Read correctly without rotating first; reports the rotation needed | No pre-rotation needed for reading; rotation kept for display |
| Grounding boxes (0-1000 grid) | Boxes land on the right fields; a small upward bias of about half a text line | Calibrate on synthetic notes with true boxes; pad highlighter boxes |
| Row count mode (`filas_de_producto_contadas`) | Matches on the first notes tried | Keep as independent check; measure on the full set |
| SAM 3.1, several notes in one photo | "sheet of paper" 3/3 (conf 0.97), "document" 3/3 (0.95), "paper" 3/3, "receipt" 3/3, "invoice" 0/3. ~1.5 s | Prompt `sheet of paper`, fallback `document` |
| SAM 3.1 counting crates/boxes on 21 public photos (P1 "count the goods") | Exact 5/23, within one 7/23 (the bar was 8/10) | Dropped. Stated as a limitation |
| Voice Transcribe | `POST /v1/asr/transcribe`, multipart, WAV only. Spanish question transcribed correctly in 3.4 s for 3.6 s of audio | Browser records, converts to 16 kHz mono WAV before upload |
