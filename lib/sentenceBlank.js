function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitDelimited(value) {
  return (value || '')
    .split('()')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSentencePairs(example, exampleVi) {
  const sentences = splitDelimited(example);
  const meanings = splitDelimited(exampleVi);
  return sentences.map((sentence, i) => ({ sentence, meaning: meanings[i] || '' }));
}

function buildBlank(sentence, wordText) {
  if (!sentence || !wordText) return null;
  const re = new RegExp(`\\b${escapeRegExp(wordText)}\\b`, 'i');
  if (!re.test(sentence)) return null;
  return sentence.replace(re, '____');
}

function hasUsableSentence(example, wordText) {
  return splitDelimited(example).some((sentence) => buildBlank(sentence, wordText) !== null);
}

module.exports = { parseSentencePairs, buildBlank, hasUsableSentence };
