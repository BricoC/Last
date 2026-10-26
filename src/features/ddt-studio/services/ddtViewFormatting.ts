import { MonetaryValue } from "@/shared/domain/monetaryValue";
import { toDateIT } from "../utils/ddtCalculations";

export const formatDdtMoney = (subunits: number) => `€ ${MonetaryValue.fromSubunits(subunits).formatIT(false)}`;
export const formatDdtPercent = (value: number | null) => value === null ? "—" : `${value.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
export const formatDdtViewDate = (value: string) => toDateIT(value);
export const formatDdtNumber = (number: number | null, series: string) => number === null ? "Bozza" : `${series ? `${series}/` : ""}${number}`;
