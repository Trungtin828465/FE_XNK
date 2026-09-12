export function normalizeCatalogText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

export function findBestCatalogMatch<T>(
  rawName: string,
  records: T[],
  nameField: keyof T,
): T | undefined {
  const wanted = normalizeCatalogText(rawName);
  if (!wanted) return undefined;

  const exact = records.find((record) => normalizeCatalogText(record[nameField]) === wanted);
  if (exact) return exact;

  const contained = records.filter((record) => {
    const candidate = normalizeCatalogText(record[nameField]);
    return candidate.length >= 3 && (wanted.includes(candidate) || candidate.includes(wanted));
  });
  if (contained.length === 1) return contained[0];

  const words = wanted.split(" ").filter((word) => word.length >= 3);
  const ranked = records
    .map((record) => {
      const candidate = normalizeCatalogText(record[nameField]);
      const targets = [wanted, ...words];
      const distance = Math.min(...targets.map((target) => editDistance(candidate, target)));
      return { record, candidate, distance };
    })
    .filter(({ candidate, distance }) => candidate.length >= 3 && distance <= Math.max(1, Math.floor(candidate.length * 0.25)))
    .sort((left, right) => left.distance - right.distance);

  if (ranked.length === 0 || (ranked[1] && ranked[1].distance === ranked[0].distance)) return undefined;
  return ranked[0].record;
}
