/**
 * "Умный" поиск по фрагментам слов: запрос делится на токены по пробелам,
 * и позиция считается совпавшей, если КАЖДЫЙ токен встречается где-то в
 * тексте — независимо от порядка, регистра и без необходимости вводить
 * слово целиком. Например, запрос "штук стен" найдёт "Штукатурка стен
 * по маякам", хотя такой подстроки в названии нет буквально.
 */

function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").trim();
}

function tokenize(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

/** true, если каждый фрагмент запроса встречается где-то в тексте. */
export function matchesQuery(text: string, query: string): boolean {
  const tokens = tokenize(query);
  if (!tokens.length) return true;
  const t = normalize(text);
  return tokens.every((tok) => t.includes(tok));
}

/** Оценка релевантности для сортировки: меньше — лучше (точнее совпадение). */
function matchScore(text: string, query: string): number {
  const tokens = tokenize(query);
  const t = normalize(text);
  let score = 0;
  for (const tok of tokens) {
    const idx = t.indexOf(tok);
    if (idx === -1) continue;
    const prevChar = t[idx - 1];
    const isWordStart = idx === 0 || !prevChar || /[^а-яa-z0-9]/i.test(prevChar);
    score += idx + (isWordStart ? 0 : 50);
  }
  score += t.length * 0.05; // при прочих равных короче название — выше
  return score;
}

/** Фильтрует и сортирует список по релевантности умного поиска. */
export function smartFilter<T>(items: T[], query: string, getText: (item: T) => string): T[] {
  const q = query.trim();
  if (!q) return items;
  return items
    .filter((item) => matchesQuery(getText(item), q))
    .sort((a, b) => matchScore(getText(a), q) - matchScore(getText(b), q));
}
