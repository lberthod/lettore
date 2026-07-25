#!/usr/bin/env node
// Extrait la liste dédupliquée de tous les mots italiens présents dans
// src/texts/*.json et src/books/*/*.json (clés de `words{}`).
// Aucun appel LLM ici — purement déterministe.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_PATH = path.join(ROOT, 'scripts', 'data', 'dictionary-words.json');

function collectJsonFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectJsonFiles(full));
    else if (entry.endsWith('.json')) out.push(full);
  }
  return out;
}

function extractWords(files) {
  const words = new Map(); // word -> { count, sources: Set }
  for (const file of files) {
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    const map = data.words;
    if (!map || typeof map !== 'object') continue;
    const rel = path.relative(ROOT, file);
    for (const key of Object.keys(map)) {
      const word = key.trim().toLowerCase();
      if (!word) continue;
      if (!words.has(word)) words.set(word, { count: 0, sources: new Set() });
      const entry = words.get(word);
      entry.count += 1;
      if (entry.sources.size < 3) entry.sources.add(rel);
    }
  }
  return words;
}

const textsFiles = collectJsonFiles(path.join(ROOT, 'src', 'texts'));
const booksFiles = collectJsonFiles(path.join(ROOT, 'src', 'books'));
const allFiles = [...textsFiles, ...booksFiles];

const words = extractWords(allFiles);

const list = [...words.entries()]
  .map(([word, { count, sources }]) => ({ word, count, sources: [...sources] }))
  .sort((a, b) => a.word.localeCompare(b.word, 'it'));

writeFileSync(OUT_PATH, JSON.stringify(list, null, 2) + '\n');

console.log(`Fichiers scannés : ${allFiles.length} (${textsFiles.length} textes, ${booksFiles.length} chapitres)`);
console.log(`Mots uniques trouvés : ${list.length}`);
console.log(`Écrit dans : ${path.relative(ROOT, OUT_PATH)}`);
