import { parseDdtQuantity } from "../utils/ddtQuantity";
import { MonetaryValue } from "@/shared/domain/monetaryValue";
import { calculateRowAmounts } from "../utils/ddtCalculations";
import type { DdtItemSnapshot } from "./ddtMergeUtils";

export function recomputeItemAmounts(item: DdtItemSnapshot): DdtItemSnapshot {
  const isNote =
    item.row_kind === "note" ||
    (item.row_kind !== "item" &&
      Boolean(item.description.trim()) &&
      item.unit_price_subunits === 0 &&
      item.purchase_price_subunits === 0 &&
      (!item.code || !item.code.trim()) &&
      (!item.unit || !String(item.unit).trim()) &&
      ((parseDdtQuantity(item.quantity) ?? 0) <= 0));

  if (isNote) {
    return {
      ...item,
      row_kind: "note",
      unit: "",
      quantity: "",
      unit_price_subunits: 0,
      discount_pct: "",
      net_amount_subunits: 0,
      vat_rate: 0,
      vat_amount_subunits: 0,
      purchase_price_subunits: 0,
    };
  }

  const rawQty = (item.quantity ?? "").trim();
  const unitMoney = MonetaryValue.fromSubunits(item.unit_price_subunits || 0);
  const { netAmount: net, vatAmount: vat } = calculateRowAmounts(
    rawQty === "" ? "1" : rawQty,
    unitMoney,
    item.discount_pct,
    item.vat_rate
  );

  return {
    ...item,
    row_kind: "item",
    net_amount_subunits: net.toSubunits(),
    vat_amount_subunits: vat.toSubunits(),
  };
}
