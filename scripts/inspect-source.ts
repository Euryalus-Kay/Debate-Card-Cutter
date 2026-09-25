import { fetchSource } from "@/server/research/fetcher";
const f = await fetchSource(process.argv[2]);
console.log(f.ok, f.method, f.format, f.error ?? "", "paras", f.paragraphs.length, "chars", f.text.length);
console.log("META", JSON.stringify(f.metadata));
const from = Number(process.argv[3] ?? 0);
f.paragraphs.slice(from, from + Number(process.argv[4] ?? 12)).forEach((p, i) => console.log(`[${from + i + 1}]${f.paragraphPages ? ` (p${f.paragraphPages[from + i].join("-")})` : ""} ${p.slice(0, 220)}${p.length > 220 ? ` …(${p.length})` : ""}`));
