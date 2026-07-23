function deriveWordType(componentTypes) {
  const rootCount = componentTypes.filter((t) => t === 'root').length;
  const hasAffix = componentTypes.includes('prefix') || componentTypes.includes('suffix');
  if (rootCount === 0) return 'simple';
  if (rootCount === 1) return hasAffix ? 'derived' : 'simple';
  return hasAffix ? 'compound_derived' : 'compound';
}

function attachWordType(word) {
  const wordComponents = [...(word.word_components || [])].sort((a, b) => a.position - b.position);
  const componentTypes = wordComponents.map((wc) => wc.component.component_type);
  return { ...word, word_components: wordComponents, word_type: deriveWordType(componentTypes) };
}

module.exports = { deriveWordType, attachWordType };
