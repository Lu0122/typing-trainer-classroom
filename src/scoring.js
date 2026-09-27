function visibleCharacters(text = '') {
  return Array.from(String(text).replace(/\s/g, ''));
}

function scoreTyping(targetText, typedText) {
  const target = visibleCharacters(targetText);
  const typed = visibleCharacters(typedText).slice(0, target.length);
  let correct = 0;

  for (let index = 0; index < typed.length; index += 1) {
    if (typed[index] === target[index]) correct += 1;
  }

  const typedCount = typed.length;
  const wrong = Math.max(0, typedCount - correct);
  const accuracy = typedCount === 0 ? 0 : Math.round((correct / typedCount) * 1000) / 10;

  return {
    score: correct,
    typedCount,
    wrong,
    accuracy,
    completed: typedCount >= target.length
  };
}

module.exports = { scoreTyping, visibleCharacters };
