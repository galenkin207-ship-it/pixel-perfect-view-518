// Номер сборника (уровень 1) зашит в конце gesn_code, напр. "ГЭСН01" -> "1.",
// "ГЭСНр51" -> "51.". У синтетического узла "Существующие виды работ (до
// обновления)" gesn_code пустой — для него номер не показываем.
// Отдельно: "ГЭСНм" (сборники монтажных работ, напр. "ГЭСНм08") дают "8м.",
// а не "8." — иначе номер визуально совпадает с обычным ГЭСН08 из каталога
// нового строительства.
export function formatGesnNumberLabel(gesnCode: string | null): string | null {
  if (!gesnCode) return null;
  const match = /(\d+)$/.exec(gesnCode);
  if (!match) return null;
  return gesnCode.startsWith("ГЭСНм") ? `${match[1]}м.` : `${match[1]}.`;
}

function normalizeForNameCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Название позиции под группой (level 4) — то же правило, что buildLeafName на
// сервере (work-types-shared.js), для предпросмотра «В записи будет»:
//  - группа на «:» → «группа вариант», иначе → «группа: вариант»;
//  - пустой вариант → название группы;
//  - вариант, равный названию группы или начинающийся с него по границе слова
//    (регистр, ё→е, пунктуация и лишние пробелы не важны) → сам вариант.
export function buildLeafName(groupName: string, variant: string): string {
  const group = groupName.replace(/\s+/g, " ").trim();
  const v = variant.replace(/\s+/g, " ").trim();
  if (!v) return group;
  if (!group) return v;
  const normGroup = normalizeForNameCompare(group);
  const normVariant = normalizeForNameCompare(v);
  if (normGroup && (normVariant === normGroup || normVariant.startsWith(`${normGroup} `))) return v;
  return group.endsWith(":") ? `${group} ${v}` : `${group}: ${v}`;
}

const COLUMN_LEVEL_LABELS: Record<number, string> = {
  1: "Сборник",
  2: "Раздел",
  3: "Таблица",
  4: "Группа",
  5: "Позиции",
};

// Заголовок колонки каскада по РЕАЛЬНЫМ уровням её узлов (level — тип узла, а не
// номер колонки: группа может лежать прямо под сборником, схлопнутые уровни
// не рисуются). Смешанная колонка — «<Уровни контейнеров> / Позиции», напр.
// «Группа / Позиции». Пока узлов нет (загрузка, пусто) — по ожидаемому уровню:
// уровень родителя + 1 (expectedLevel).
export function columnLabel(nodes: { level: number }[], expectedLevel: number): string {
  if (nodes.length === 0) return COLUMN_LEVEL_LABELS[Math.min(Math.max(expectedLevel, 1), 5)]!;
  const levels = [...new Set(nodes.map((n) => Math.min(Math.max(n.level, 1), 5)))].sort((a, b) => a - b);
  return levels.map((l) => COLUMN_LEVEL_LABELS[l]!).join(" / ");
}
