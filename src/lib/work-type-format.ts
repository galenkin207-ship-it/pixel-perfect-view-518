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
