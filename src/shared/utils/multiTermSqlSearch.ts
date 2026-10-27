export interface MultiTermSqlSearchOptions {
  numberedParameters?: boolean;
  firstParameterIndex?: number;
  stripPunctuation?: boolean;
}

/** Builds an AND-of-ORs SQL predicate: every search word must match at least one field. */
export function buildMultiTermSqlSearch(
  query: string,
  fields: readonly string[],
  options: MultiTermSqlSearchOptions = {}
): { sql: string; params: string[] } {
  const terms = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const params: string[] = [];
  let parameterIndex = options.firstParameterIndex ?? 1;
  const clauses = terms.map((term) => {
    const cleanTerm = term.replace(/[.\-_']/g, "");
    const fieldClauses = fields.map((field) => {
      const normalizedField = normalizeSqlField(field);
      if (options.stripPunctuation && cleanTerm) {
        params.push(`%${term}%`);
        const p1 = options.numberedParameters === false ? "?" : `$${parameterIndex++}`;
        params.push(`%${cleanTerm}%`);
        const p2 = options.numberedParameters === false ? "?" : `$${parameterIndex++}`;
        return `(${normalizedField} LIKE ${p1} OR REPLACE(REPLACE(REPLACE(${normalizedField}, '.', ''), '-', ''), '''' , '') LIKE ${p2})`;
      }
      params.push(`%${term}%`);
      const placeholder = options.numberedParameters === false ? "?" : `$${parameterIndex++}`;
      return `${normalizedField} LIKE ${placeholder}`;
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
