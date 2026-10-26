// Blocks real restaurant data from entering the repo. Runs as a pre-commit hook (staged files)
// and in CI (--all). Real delivery notes live outside the repo; only aggregate numbers come in.
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const all = process.argv.includes("--all");
const files = execSync(all ? "git ls-files" : "git diff --cached --name-only --diff-filter=ACM", { encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean);

// Patterns are built from pieces so this file does not match itself.
const banned = [
  new RegExp(["som", "i[oó]"].join(""), "i"), // the family restaurant's name
  new RegExp(["B33", "942871"].join("")), // its tax ID
  /\bES\d{2}[ ]?\d{4}[ ]?\d{4}[ ]?\d{2}[ ]?\d{10}\b/, // Spanish IBAN
];
const bannedPaths = [/datos-reales/i, /\.smoke\//, /eval\/private\//];
const binary = /\.(pdf|jpe?g|png|webp|heic)$/i;

const problems = [];
for (const f of files) {
  if (bannedPaths.some((p) => p.test(f))) { problems.push(`${f}: path is private`); continue; }
  if (f === "scripts/hooks/privacy-check.mjs" || binary.test(f) || !existsSync(f)) continue;
  const text = readFileSync(f, "utf8");
  for (const re of banned) if (re.test(text)) problems.push(`${f}: matches ${re}`);
}
if (problems.length) {
  console.error("Privacy check failed. Real data must not enter the repo:\n" + problems.map((p) => "  - " + p).join("\n"));
  process.exit(1);
}
console.log(`privacy check ok (${files.length} files)`);
