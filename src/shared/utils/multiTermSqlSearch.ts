/** Builds an AND-of-ORs SQL predicate: every search word must match at least one field. */
export function buildMultiTermSqlSearch(
  query: string,
  fields: readonly string[],
  options: { numberedParameters?: boolean; firstParameterIndex?: number } = {}
): { sql: string; params: string[] } {
  const terms = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const params: string[] = [];
  let parameterIndex = options.firstParameterIndex ?? 1;
  const clauses = terms.map((term) => {
    const fieldClauses = fields.map((field) => {
      params.push(`%${term}%`);
      const placeholder = options.numberedParameters === false ? "?" : `$${parameterIndex++}`;
      return `${normalizeSqlField(field)} LIKE ${placeholder}`;
    });
    return `(${fieldClauses.join(" OR ")})`;
  });
  return { sql: clauses.length ? clauses.join(" AND ") : "", params };
}

function normalizeSqlField(field: string): string {
  const accentedCharacters: readonly [string, string][] = [
    ["À", "a"], ["Á", "a"], ["à", "a"], ["á", "a"],
    ["È", "e"], ["É", "e"], ["è", "e"], ["é", "e"],
    ["Ì", "i"], ["Í", "i"], ["ì", "i"], ["í", "i"],
    ["Ò", "o"], ["Ó", "o"], ["ò", "o"], ["ó", "o"],
    ["Ù", "u"], ["Ú", "u"], ["ù", "u"], ["ú", "u"],
  ];
  return accentedCharacters.reduce(
    (expression, [character, replacement]) => `REPLACE(${expression}, '${character}', '${replacement}')`,
    `LOWER(${field})`,
  );
}
