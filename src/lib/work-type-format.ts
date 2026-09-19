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
