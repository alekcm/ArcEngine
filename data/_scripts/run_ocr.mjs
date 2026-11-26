#!/usr/bin/env node
// OCR runner for Fall of Avalon prep jobs — tesseract.js, 2 workers, resumable.
// Usage: node run_ocr.mjs [jobs_file]   (default /tmp/ocrprep/jobs.json)
// Appends {id, group, conf, text} lines to /tmp/ocrprep/results.jsonl.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/ocrlab/');
const { createWorker } = require('tesseract.js');

const JOBS_FILE = process.argv[2] || '/tmp/ocrprep/jobs.json';
const RESULTS = '/tmp/ocrprep/results.jsonl';

const PSM = {
  book: '3', alt: '3', letter: '4', card: '3', retry: '3',
  dig: '8', num: '7', num2: '3', num3: '11',
};
const DIGIT = new Set(['dig', 'num', 'num2', 'num3']);

const jobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));

// resumable: skip ids already present in results.jsonl
const done = new Set();
if (fs.existsSync(RESULTS)) {
  for (const line of fs.readFileSync(RESULTS, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { done.add(JSON.parse(line).id); } catch {}
  }
}
const queue = jobs.filter(j => !done.has(j.id));
console.log(`jobs ${jobs.length}, done ${done.size}, pending ${queue.length}`);
if (!queue.length) process.exit(0);

const out = fs.openSync(RESULTS, 'a');
let n = 0;
const total = queue.length;
const sums = {};
const errs = [];

async function worker(tag) {
  const w = await createWorker('rus', 1, {
    langPath: '/tmp/tessdata',
    cachePath: '/tmp/tessdata',
    corePath: '/tmp/ocrlab/node_modules/tesseract.js-core',
  });
  for (;;) {
    const job = queue.shift();
    if (!job) break;
    try {
      await w.setParameters({
        tessedit_pageseg_mode: PSM[job.group] ?? '3',
        tessedit_char_whitelist: DIGIT.has(job.group) ? '0123456789' : '',
      });
      const { data } = await w.recognize(fs.readFileSync(job.path));
      const conf = Math.round(data.confidence);
      fs.writeSync(out, JSON.stringify({
        id: job.id, group: job.group, conf, text: data.text,
      }) + '\n');
      const s = sums[job.group] || (sums[job.group] = { n: 0, conf: 0, empty: 0 });
      s.n++; s.conf += conf;
      if (!data.text.trim()) s.empty++;
    } catch (e) {
      fs.writeSync(out, JSON.stringify({
        id: job.id, group: job.group, conf: -1, text: '', error: String(e),
      }) + '\n');
      errs.push(job.id);
    }
    if (++n % 100 === 0) console.log(`progress ${n}/${total}`);
  }
  await w.terminate();
  console.log(`worker ${tag} finished`);
}

await Promise.all([worker(1), worker(2)]);
fs.closeSync(out);

for (const [g, s] of Object.entries(sums)) {
  console.log(`group ${g}: ${s.n} jobs, avg conf ${(s.conf / s.n).toFixed(1)}, empty ${s.empty}`);
}
if (errs.length) console.log(`ERRORS (${errs.length}): ${errs.slice(0, 10).join(', ')}`);
console.log(`OCR complete: ${n} new results -> ${RESULTS}`);
