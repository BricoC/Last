const decimalQuantity = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;
const scientificQuantity = /^(?:0|[1-9]\d*)(?:\.\d+)?[eE][+-]?\d+$/;

/** A single separator denotes decimals. Repeated separators must form thousands groups. */
export function normalizeDdtQuantity(value: string | number | null | undefined): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  const signed = value?.trim() ?? "";
  const magnitude = signed.replace(/^[+-]/, "");
  let normalized: string;

  if (scientificQuantity.test(magnitude)) {
    normalized = magnitude;
  } else if (decimalQuantity.test(magnitude)) {
    normalized = magnitude.replace(",", ".");
  } else {
    if (!/^[\d.,]+$/.test(magnitude)) return null;
    const dot = magnitude.indexOf(".");
    const comma = magnitude.indexOf(",");
    const groupSeparator = comma < 0 || (dot >= 0 && dot < comma) ? "." : ",";
    const decimalSeparator = groupSeparator === "." ? "," : ".";
    const [whole, fraction = "", ...extra] = magnitude.split(decimalSeparator);
    const groups = whole.split(groupSeparator);
    if (extra.length || groups.length < 2 || !/^\d{1,3}$/.test(groups[0]) ||
      groups.slice(1).some((group) => !/^\d{3}$/.test(group)) || !/^\d*$/.test(fraction)) return null;
    normalized = groups.join("") + (fraction ? `.${fraction}` : "");
  }

  return signed.startsWith("-") ? `-${normalized}` : normalized;
}

export function parseDdtQuantity(value: string | number | null | undefined): number | null {
  const normalized = normalizeDdtQuantity(value);
  if (normalized === null) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

/** SQLite counterpart for reports over the original TEXT quantities. */
export function ddtQuantitySql(column: string): string {
  return `(
    SELECT CASE
      WHEN length(raw_quantity) <= 50 AND raw_quantity GLOB '[0-9]*'
        AND raw_quantity NOT GLOB '*[^0-9.,]*'
        AND length(raw_quantity) - length(replace(replace(raw_quantity,'.',''),',','')) <= 1
        THEN CAST(replace(raw_quantity,',','.') AS REAL)
      ELSE (
    WITH magnitude(value, sign) AS (
      SELECT CASE WHEN substr(raw_quantity,1,1) IN ('+','-') THEN substr(raw_quantity,2) ELSE raw_quantity END,
             CASE WHEN substr(raw_quantity,1,1) = '-' THEN -1 ELSE 1 END
    ), separators(value, sign, dots, commas) AS (
      SELECT value, sign, length(value) - length(replace(value,'.','')),
             length(value) - length(replace(value,',','')) FROM magnitude
    ), parts(value, sign, dots, commas, grouping, decimal) AS (
      SELECT value, sign, dots, commas,
             CASE WHEN commas = 0 OR (dots > 0 AND instr(value,'.') < instr(value,',')) THEN '.' ELSE ',' END,
             CASE WHEN dots > 0 AND commas > 0 THEN
               CASE WHEN instr(value,'.') < instr(value,',') THEN ',' ELSE '.' END
             ELSE '' END FROM separators
    ), digits(value, sign, dots, commas, grouping, decimal, whole, fraction) AS (
      SELECT value, sign, dots, commas, grouping, decimal,
             CASE WHEN decimal = '' THEN value ELSE substr(value,1,instr(value,decimal)-1) END,
             CASE WHEN decimal = '' THEN '' ELSE substr(value,instr(value,decimal)+1) END FROM parts
    ), numeric_value(number) AS (
      SELECT sign * CASE
        WHEN value GLOB '*[eE]*' AND value GLOB '[0-9]*'
          AND value NOT GLOB '*[^0-9.eE+-]*' AND json_valid(value)
          THEN CAST(value AS REAL)
        WHEN value GLOB '*[0-9]*' AND value NOT GLOB '*[^0-9.,]*' THEN
          CASE WHEN dots + commas <= 1 THEN CAST(replace(value,',','.') AS REAL)
            WHEN instr(whole,grouping) > 0 AND fraction NOT GLOB '*[^0-9]*'
              AND NOT EXISTS (
                SELECT 1 FROM json_each('["' || replace(whole,grouping,'","') || '"]') AS segment
                WHERE (segment.key = 0 AND length(segment.value) NOT BETWEEN 1 AND 3)
                   OR (segment.key > 0 AND length(segment.value) <> 3)
              )
            THEN CAST(replace(whole,grouping,'') || '.' || fraction AS REAL)
          END
      END FROM digits
    )
    SELECT CASE WHEN abs(number) <= 1.7976931348623157e308 THEN number END FROM numeric_value
      )
    END FROM (SELECT trim(CAST(${column} AS TEXT), char(9,10,11,12,13,32,160,8239)) AS raw_quantity)
  )`;
}
