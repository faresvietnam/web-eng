const REQUIRED_HEADERS = ['word', 'meaning'];
const OPTIONAL_HEADERS = ['category', 'part_of_speech', 'ipa', 'example', 'example_vi', 'segments'];

function parseWordsCsv(text) {
  const allLines = text.split(/\r?\n/);
  const hasContent = allLines.some((line) => line.trim().length > 0);
  if (!hasContent) return { rows: [], errors: [] };

  const headers = allLines[0].split(',').map((h) => h.trim());
  const rows = [];
  const errors = [];

  for (let i = 1; i < allLines.length; i++) {
    const line = allLines[i];
    if (line.trim().length === 0) continue;

    const values = line.split(',').map((v) => v.trim());
    const raw = {};
    headers.forEach((h, idx) => {
      raw[h] = values[idx] ?? '';
    });

    const missing = REQUIRED_HEADERS.filter((h) => !raw[h]);
    if (missing.length > 0) {
      errors.push({ line: i + 1, reason: `Thiếu field: ${missing[0]}` });
      continue;
    }

    const row = { word: raw.word, meaning: raw.meaning };
    OPTIONAL_HEADERS.forEach((h) => {
      row[h] = raw[h] ? raw[h] : null;
    });
    rows.push(row);
  }

  return { rows, errors };
}

module.exports = { parseWordsCsv };
