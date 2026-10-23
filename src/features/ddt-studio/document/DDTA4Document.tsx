import { forwardRef } from "react";
import { DdtDocument, DdtItem } from "../models/ddt";
import { safeMoney, isPositivePrice } from "@/shared/domain/monetaryValue";
import {
  calculateDdtTotals,
  paginateDdtRows,
  toDateIT,
  getOperatorSymbol,
  formatAddressOrCity,
  formatCascadeDiscountDisplay,
} from "../utils/ddtCalculations";
import bricoLogo from "@/assets/logo_brico_class.jpg";

export const DDT_CONFIG = {
  // 1. Riquadro Numero documento & Data documento (in alto a destra)
  intestazione: {
    larghezza: "340px",
    altezzaHeader: "26px",
    fontSizeHeader: "11.5px",
    paddingTopHeader: "3px",
    altezzaDati: "45px",
    fontSizeDati: "29px",
    paddingTopDati: "5px",
  },

  // 2. Finestre Clienti ("Spettabile ditta" e "Luogo di destinazione merce")
  clienti: {
    altezza: "86px",
    spazioTraBox: "8px",
    margineSotto: "8px",
    paddingTop: "6px",
    paddingLeft: "10px",
    paddingRight: "10px",
    fontSizeTitolo: "9.5px",
    fontSizeNome: "12px",
    fontSizeIndirizzo: "10px",
    fontSizeDatiFiscali: "8.5px",
  },

  // 3. Riga Commerciale (Causale, OP, Pagamento/Ordine, In Conto/A Saldo)
  commerciale: {
    altezza: "52px",
    margineSotto: "8px",
    paddingTop: "6px",
    causaleLabelSize: "9px",
    causaleValueSize: "12px",
    opWidth: "48px",
    opLabelSize: "9px",
    opValueSize: "12.5px",
    pagamentoLabelSize: "9px",
    pagamentoValueSize: "10px",
    saldoWidth: "115px",
  },

  // 4. Tabella Righe Articoli (Corpo della DDT)
  articoli: {
    altezzaHeader: "23px",
    fontSizeHeader: "8.5px",
    paddingTopHeader: "6px",
    altezzaRiga: "21px",
    fontSizeDescrizione: "9.5px",
    fontSizePrezzo: "9px",
    fontSizeScontoIva: "8.5px",
    paddingTopRiga: "5.5px",
  },

  // 5. Riquadro Totali a Piè di Pagina (Footer)
  footer: {
    altezzaTotali: "44px",
    fontSizeLabelTotali: "8px",
    fontSizeValoriTotali: "12px",
    paddingTopValori: "11px",
  },
};

export interface DDTA4DocumentProps {
  ddt: Partial<DdtDocument>;
  items: DdtItem[];
  isPrintOnly?: boolean;
}

export const DDTA4Document = forwardRef<HTMLDivElement, DDTA4DocumentProps>(
  ({ ddt, items, isPrintOnly = false }, ref) => {
    const pages = paginateDdtRows(items);
    const totals = calculateDdtTotals(items);

    return (
      <div
        ref={ref}
        id={isPrintOnly ? "ddt-pro-print-wrapper" : undefined}
        className={isPrintOnly ? "flex flex-col items-center p-0 m-0 gap-0" : "flex flex-col items-center gap-6 py-4 select-text"}
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
      >
        {pages.map((p) => (
          <div
            key={`page-${p.pageNum}`}
            className={`ddt-a4-page ${
              isPrintOnly
                ? "ddt-a4-page-print !shadow-none !border-none"
                : "shadow-2xl border border-zinc-300"
            } bg-white text-black text-[10.5px] leading-tight select-text relative rounded-none print:border-none print:shadow-none print:rounded-none`}
            style={{
              fontFamily: "'Times New Roman', Times, serif",
              width: "210mm",
              minHeight: "297mm",
              height: "297mm",
              maxHeight: "297mm",
              padding: "7mm 10mm 8mm 10mm",
              boxSizing: "border-box",
              pageBreakAfter: "always",
              breakAfter: "page",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              background: "#ffffff",
              overflow: "hidden",
            }}
          >
            {/* ZONA SUPERIORE: INTESTAZIONE & METADATI DDT */}
            <div>
              {/* Header: Logo Azienda a Sinistra + Riquadro N° Doc / Data a Destra */}
              <div className="pb-1 mb-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <img
                      src={bricoLogo}
                      alt="Ferramenta Brico Class S.A.S."
                      style={{
                        maxHeight: "110px",
                        maxWidth: "430px",
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  </div>

                  <div className="flex flex-col items-center ml-auto">
                    <div style={{ marginBottom: "6px", textAlign: "center" }}>
                      <span
                        style={{
                          fontSize: "13.5px",
                          fontWeight: "bold",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          color: "#000000",
                          display: "block",
                          lineHeight: "1.2",
                        }}
                      >
                        DOCUMENTO DI TRASPORTO (D.d.t)
                      </span>
                    </div>
                    <table
                      className="border-collapse border-2 border-black text-center"
                      style={{ width: DDT_CONFIG.intestazione.larghezza, tableLayout: "fixed" }}
                    >
                      <thead style={{ backgroundColor: "#dcdcdc" }}>
                        <tr style={{ height: DDT_CONFIG.intestazione.altezzaHeader }}>
                          <th
                            style={{
                              width: "50%",
                              textAlign: "center",
                              verticalAlign: "middle",
                              fontWeight: "normal",
                              fontSize: DDT_CONFIG.intestazione.fontSizeHeader,
                              color: "#000000",
                              borderBottom: "1.5px solid black",
                              borderRight: "1px solid black",
                              height: DDT_CONFIG.intestazione.altezzaHeader,
                              lineHeight: "1",
                            }}
                          >
                            Numero documento
                          </th>
                          <th
                            style={{
                              width: "50%",
                              textAlign: "center",
                              verticalAlign: "middle",
                              fontWeight: "normal",
                              fontSize: DDT_CONFIG.intestazione.fontSizeHeader,
                              color: "#000000",
                              borderBottom: "1.5px solid black",
                              height: DDT_CONFIG.intestazione.altezzaHeader,
                              lineHeight: "1",
                            }}
                          >
                            Data documento
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ height: DDT_CONFIG.intestazione.altezzaDati, backgroundColor: "#ffffff" }}>
                          <td
                            style={{
                              width: "50%",
                              textAlign: "center",
                              verticalAlign: "middle",
                              fontSize: DDT_CONFIG.intestazione.fontSizeDati,
                              fontWeight: "normal",
                              fontFamily: "'Times New Roman', Times, serif",
                              color: "#000000",
                              borderRight: "1px solid black",
                              height: DDT_CONFIG.intestazione.altezzaDati,
                              lineHeight: "1",
                            }}
                          >
                            {ddt.doc_number !== null
                              ? `${ddt.series ? `${ddt.series}/` : ""}${ddt.doc_number}`
                              : "BOZZA"}
                          </td>
                          <td
                            style={{
                              width: "50%",
                              textAlign: "center",
                              verticalAlign: "middle",
                              fontSize: DDT_CONFIG.intestazione.fontSizeDati,
                              fontWeight: "normal",
                              fontFamily: "'Times New Roman', Times, serif",
                              color: "#000000",
                              height: DDT_CONFIG.intestazione.altezzaDati,
                              lineHeight: "1",
                            }}
                          >
                            {toDateIT(ddt.doc_date)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* SE PAGINA 1: DATI CLIENTE COMPLETI & DETTAGLI COMMERCIALE */}
              {p.isFirst && (
                <>
                  {/* Grid 2 colonne: Spettabile ditta + Luogo destinazione */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: DDT_CONFIG.clienti.spazioTraBox,
                      marginBottom: DDT_CONFIG.clienti.margineSotto,
                    }}
                  >
                    {/* Spettabile ditta */}
                    <div
                      style={{
                        border: "1px solid #000",
                        paddingTop: DDT_CONFIG.clienti.paddingTop,
                        paddingBottom: "5px",
                        paddingLeft: DDT_CONFIG.clienti.paddingLeft,
                        paddingRight: DDT_CONFIG.clienti.paddingRight,
                        height: DDT_CONFIG.clienti.altezza,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        textAlign: "left",
                        backgroundColor: "#ffffff",
                        boxSizing: "border-box",
                      }}
                    >
                      <div
                        style={{
                          fontSize: DDT_CONFIG.clienti.fontSizeTitolo,
                          fontStyle: "italic",
                          color: "#3f3f46",
                          lineHeight: "1.2",
                        }}
                      >
                        Spettabile ditta
                      </div>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-around", paddingTop: "1px" }}>
                        <div
                          style={{
                            fontSize: DDT_CONFIG.clienti.fontSizeNome,
                            textTransform: "uppercase",
                            color: "#09090b",
                            lineHeight: "1.2",
                            fontWeight: "normal",
                          }}
                        >
                          {ddt.client_name || "—"}
                        </div>
                        <div style={{ fontSize: DDT_CONFIG.clienti.fontSizeIndirizzo, color: "#18181b", lineHeight: "1.2" }}>
                          {formatAddressOrCity(ddt.client_address)}
                        </div>
                        <div style={{ fontSize: DDT_CONFIG.clienti.fontSizeIndirizzo, color: "#18181b", lineHeight: "1.2" }}>
                          {formatAddressOrCity(ddt.client_city)}
                        </div>
                        {(ddt.client_vat || ddt.client_fiscal_code || ddt.client_sdi) && (
                          <div style={{ fontSize: DDT_CONFIG.clienti.fontSizeDatiFiscali, color: "#52525b", lineHeight: "1.1" }}>
                            {ddt.client_vat ? `P.IVA: ${ddt.client_vat} ` : ""}
                            {ddt.client_fiscal_code ? `C.F.: ${ddt.client_fiscal_code} ` : ""}
                            {ddt.client_sdi ? `SDI: ${ddt.client_sdi}` : ""}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Luogo di destinazione merce */}
                    <div
                      style={{
                        border: "1px solid #000",
                        paddingTop: DDT_CONFIG.clienti.paddingTop,
                        paddingBottom: "5px",
                        paddingLeft: DDT_CONFIG.clienti.paddingLeft,
                        paddingRight: DDT_CONFIG.clienti.paddingRight,
                        height: DDT_CONFIG.clienti.altezza,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        textAlign: "left",
                        backgroundColor: "#ffffff",
                        boxSizing: "border-box",
                      }}
                    >
                      <div
                        style={{
                          fontSize: DDT_CONFIG.clienti.fontSizeTitolo,
                          fontStyle: "italic",
                          color: "#3f3f46",
                          lineHeight: "1.2",
                        }}
                      >
                        Luogo di destinazione merce
                      </div>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-around", paddingTop: "1px" }}>
                        <div
                          style={{
                            fontSize: DDT_CONFIG.clienti.fontSizeNome,
                            textTransform: "uppercase",
                            color: "#09090b",
                            lineHeight: "1.2",
                            fontWeight: "normal",
                          }}
                        >
                          {ddt.destination_name || ddt.client_name || "—"}
                        </div>
                        <div style={{ fontSize: DDT_CONFIG.clienti.fontSizeIndirizzo, color: "#18181b", lineHeight: "1.2" }}>
                          {formatAddressOrCity(ddt.destination_address || ddt.client_address)}
                        </div>
                        <div style={{ fontSize: DDT_CONFIG.clienti.fontSizeIndirizzo, color: "#18181b", lineHeight: "1.2" }}>
                          {formatAddressOrCity(ddt.destination_city || ddt.client_city)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Riga Commerciale: Causale | OP | Pagamento & Nr vs ordine | In conto / A Saldo */}
                  <div
                    style={{
                      border: "1px solid #000",
                      display: "flex",
                      fontSize: "9.5px",
                      marginBottom: DDT_CONFIG.commerciale.margineSotto,
                      backgroundColor: "#ffffff",
                      boxSizing: "border-box",
                      height: DDT_CONFIG.commerciale.altezza,
                    }}
                  >
                    {/* Causale */}
                    <div
                      style={{
                        paddingTop: DDT_CONFIG.commerciale.paddingTop,
                        paddingBottom: "4px",
                        paddingLeft: "10px",
                        paddingRight: "10px",
                        flex: "1.1",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-start",
                        borderRight: "1px solid #000",
                        boxSizing: "border-box",
                      }}
                    >
                      <div
                        style={{
                          fontSize: DDT_CONFIG.commerciale.causaleLabelSize,
                          fontStyle: "italic",
                          color: "#27272a",
                          lineHeight: "1.2",
                          marginBottom: "3px",
                        }}
                      >
                        Causale del trasporto:
                      </div>
                      <div
                        style={{
                          fontSize: DDT_CONFIG.commerciale.causaleValueSize,
                          fontStyle: "italic",
                          color: "#09090b",
                          lineHeight: "1.2",
                        }}
                      >
                        {ddt.transport_reason || "Vendita"}
                      </div>
                    </div>

                    {/* OP */}
                    <div
                      style={{
                        paddingTop: DDT_CONFIG.commerciale.paddingTop,
                        paddingBottom: "4px",
                        paddingLeft: "6px",
                        paddingRight: "6px",
                        width: DDT_CONFIG.commerciale.opWidth,
                        height: "100%",
                        flexShrink: 0,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-start",
                        alignItems: "center",
                        textAlign: "center",
                        borderRight: "1px solid #000",
                        boxSizing: "border-box",
                      }}
                    >
                      <div
                        style={{
                          fontSize: DDT_CONFIG.commerciale.opLabelSize,
                          fontStyle: "italic",
                          color: "#27272a",
                          lineHeight: "1.2",
                          marginBottom: "3px",
                        }}
                      >
                        OP.
                      </div>
                      <div
                        style={{
                          fontSize: DDT_CONFIG.commerciale.opValueSize,
                          fontStyle: "italic",
                          color: "#09090b",
                          lineHeight: "1.2",
                        }}
                      >
                        {getOperatorSymbol(ddt.operator)}
                      </div>
                    </div>

                    {/* Pagamento & Nr vs ordine */}
                    <div
                      style={{
                        paddingTop: DDT_CONFIG.commerciale.paddingTop,
                        paddingBottom: "4px",
                        paddingLeft: "8px",
                        paddingRight: "8px",
                        flex: "1.8",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-start",
                        borderRight: "1px solid #000",
                        boxSizing: "border-box",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "4px" }}>
                        <span style={{ fontSize: DDT_CONFIG.commerciale.pagamentoLabelSize, fontStyle: "italic", color: "#27272a" }}>
                          Pagamento:
                        </span>
                        <span style={{ fontSize: DDT_CONFIG.commerciale.pagamentoValueSize, color: "#09090b" }}>
                          {ddt.payment_method || "—"}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                        <span style={{ fontSize: DDT_CONFIG.commerciale.pagamentoLabelSize, fontStyle: "italic", color: "#27272a" }}>
                          Nr. vs. ordine:
                        </span>
                        <span style={{ fontSize: DDT_CONFIG.commerciale.pagamentoValueSize, color: "#09090b" }}>
                          {ddt.order_reference || "—"}
                        </span>
                      </div>
                    </div>

                    {/* Checkbox In conto / A Saldo */}
                    <div
                      style={{
                        paddingTop: "6px",
                        paddingBottom: "4px",
                        paddingLeft: "8px",
                        paddingRight: "8px",
                        width: DDT_CONFIG.commerciale.saldoWidth,
                        height: "100%",
                        flexShrink: 0,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-around",
                        boxSizing: "border-box",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div
                          style={{
                            width: "14px",
                            height: "14px",
                            border: "1px solid #000",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "10px",
                          }}
                        >
                          {ddt.account_or_balance === "in_conto" ? "✕" : ""}
                        </div>
                        <span style={{ fontSize: "10px" }}>In conto</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div
                          style={{
                            width: "14px",
                            height: "14px",
                            border: "1px solid #000",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "10px",
                          }}
                        >
                          {ddt.account_or_balance === "a_saldo" ? "✕" : ""}
                        </div>
                        <span style={{ fontSize: "10px" }}>A Saldo</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* RIEPILOGO TESTATA SE PAGINA 2 O SUCCESSIVA */}
              {!p.isFirst && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "9.5px",
                    borderBottom: "1px solid #000",
                    paddingBottom: "4px",
                    marginBottom: "6px",
                  }}
                >
                  <div>
                    <span style={{ fontStyle: "italic", marginRight: "4px" }}>Cliente:</span>
                    <span style={{ textTransform: "uppercase" }}>{ddt.client_name}</span>
                  </div>
                  <div>
                    DDT {ddt.doc_number !== null
                      ? `#${ddt.series ? `${ddt.series}/` : ""}${ddt.doc_number}`
                      : "(Bozza)"} del {toDateIT(ddt.doc_date)}
                  </div>
                </div>
              )}

              {/* TABELLA RIGHE ARTICOLI CON HEADER #DCDCDC E GRIGLIA A LINEE CONTINUE */}
              <table
                className="w-full border-collapse border border-black text-[9.5px]"
                style={{ tableLayout: "fixed" }}
              >
                <thead>
                  <tr
                    style={{
                      height: DDT_CONFIG.articoli.altezzaHeader,
                      backgroundColor: "#dcdcdc",
                      borderBottom: "1px solid black",
                      textAlign: "center",
                    }}
                  >
                    <th
                      style={{
                        width: "42px",
                        borderRight: "1px solid black",
                        fontWeight: "normal",
                        fontSize: DDT_CONFIG.articoli.fontSizeHeader,
                        paddingTop: DDT_CONFIG.articoli.paddingTopHeader,
                      }}
                    >
                      U.M.
                    </th>
                    <th
                      style={{
                        width: "50px",
                        borderRight: "1px solid black",
                        fontWeight: "normal",
                        fontSize: DDT_CONFIG.articoli.fontSizeHeader,
                        paddingTop: DDT_CONFIG.articoli.paddingTopHeader,
                      }}
                    >
                      Q.TA'
                    </th>
                    <th
                      style={{
                        borderRight: "1px solid black",
                        fontWeight: "normal",
                        fontSize: DDT_CONFIG.articoli.fontSizeHeader,
                        paddingTop: DDT_CONFIG.articoli.paddingTopHeader,
                      }}
                    >
                      DESCRIZIONE DEI BENI (natura o qualità)
                    </th>
                    <th
                      style={{
                        width: "68px",
                        borderRight: "1px solid black",
                        fontWeight: "normal",
                        fontSize: DDT_CONFIG.articoli.fontSizeHeader,
                        paddingTop: DDT_CONFIG.articoli.paddingTopHeader,
                        textAlign: "center",
                      }}
                    >
                      Prezzo
                    </th>
                    <th
                      style={{
                        width: "45px",
                        borderRight: "1px solid black",
                        fontWeight: "normal",
                        fontSize: DDT_CONFIG.articoli.fontSizeHeader,
                        paddingTop: DDT_CONFIG.articoli.paddingTopHeader,
                      }}
                    >
                      SC %
                    </th>
                    <th
                      style={{
                        width: "75px",
                        borderRight: "1px solid black",
                        fontWeight: "normal",
                        fontSize: DDT_CONFIG.articoli.fontSizeHeader,
                        paddingTop: DDT_CONFIG.articoli.paddingTopHeader,
                        textAlign: "center",
                      }}
                    >
                      Importo
                    </th>
                    <th
                      style={{
                        width: "38px",
                        fontWeight: "normal",
                        fontSize: DDT_CONFIG.articoli.fontSizeHeader,
                        paddingTop: DDT_CONFIG.articoli.paddingTopHeader,
                      }}
                    >
                      Iva
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.rows.map((r, i) => {
                    const hasPrice = isPositivePrice(r.unit_price);
                    const hasDiscount = Boolean(r.discount_pct && formatCascadeDiscountDisplay(r.discount_pct));
                    const hasNet = isPositivePrice(r.net_amount);
                    const hasVat = r.vat_rate !== undefined && r.vat_rate !== null && String(r.vat_rate).trim() !== "";
                    const hasContent = Boolean(
                      (r.description && r.description.trim().length > 0) ||
                      hasPrice ||
                      (r.quantity && parseFloat(String(r.quantity).replace(",", ".")) > 0) ||
                      hasVat
                    );

                    return (
                      <tr
                        key={i}
                        style={{
                          height: DDT_CONFIG.articoli.altezzaRiga,
                          maxHeight: DDT_CONFIG.articoli.altezzaRiga,
                          fontWeight: "normal",
                        }}
                      >
                        <td
                          style={{
                            borderRight: "1px solid black",
                            textAlign: "center",
                            textTransform: "uppercase",
                            fontSize: DDT_CONFIG.articoli.fontSizeDescrizione,
                            paddingTop: DDT_CONFIG.articoli.paddingTopRiga,
                            height: DDT_CONFIG.articoli.altezzaRiga,
                            lineHeight: "1",
                            boxSizing: "border-box",
                          }}
                        >
                          {r.unit || ""}
                        </td>
                        <td
                          style={{
                            borderRight: "1px solid black",
                            textAlign: "center",
                            fontSize: DDT_CONFIG.articoli.fontSizeDescrizione,
                            paddingTop: DDT_CONFIG.articoli.paddingTopRiga,
                            height: DDT_CONFIG.articoli.altezzaRiga,
                            lineHeight: "1",
                            boxSizing: "border-box",
                          }}
                        >
                          {r.quantity !== "" && r.quantity !== null && r.quantity !== undefined ? r.quantity : ""}
                        </td>
                        <td
                          style={{
                            borderRight: "1px solid black",
                            textAlign: "center",
                            verticalAlign: "middle",
                            paddingLeft: "8px",
                            paddingRight: "8px",
                            textTransform: "uppercase",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                            fontSize: DDT_CONFIG.articoli.fontSizeDescrizione,
                            paddingTop: DDT_CONFIG.articoli.paddingTopRiga,
                            height: DDT_CONFIG.articoli.altezzaRiga,
                            lineHeight: "1",
                            boxSizing: "border-box",
                          }}
                        >
                          {r.description ? String(r.description).toUpperCase() : ""}
                        </td>
                        <td
                          style={{
                            borderRight: "1px solid black",
                            textAlign: "right",
                            paddingRight: "6px",
                            fontSize: DDT_CONFIG.articoli.fontSizePrezzo,
                            paddingTop: DDT_CONFIG.articoli.paddingTopRiga,
                            height: DDT_CONFIG.articoli.altezzaRiga,
                            lineHeight: "1",
                            boxSizing: "border-box",
                          }}
                        >
                          {hasPrice ? safeMoney(r.unit_price).formatIT(false) : ""}
                        </td>
                        <td
                          style={{
                            borderRight: "1px solid black",
                            textAlign: "center",
                            fontSize: DDT_CONFIG.articoli.fontSizeScontoIva,
                            paddingTop: DDT_CONFIG.articoli.paddingTopRiga,
                            height: DDT_CONFIG.articoli.altezzaRiga,
                            lineHeight: "1",
                            boxSizing: "border-box",
                          }}
                        >
                          {hasContent && hasDiscount ? formatCascadeDiscountDisplay(r.discount_pct) : ""}
                        </td>
                        <td
                          style={{
                            borderRight: "1px solid black",
                            textAlign: "right",
                            paddingRight: "6px",
                            fontSize: DDT_CONFIG.articoli.fontSizePrezzo,
                            paddingTop: DDT_CONFIG.articoli.paddingTopRiga,
                            height: DDT_CONFIG.articoli.altezzaRiga,
                            lineHeight: "1",
                            boxSizing: "border-box",
                          }}
                        >
                          {hasNet ? safeMoney(r.net_amount).formatIT(false) : ""}
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            fontSize: DDT_CONFIG.articoli.fontSizeScontoIva,
                            paddingTop: DDT_CONFIG.articoli.paddingTopRiga,
                            height: DDT_CONFIG.articoli.altezzaRiga,
                            lineHeight: "1",
                            boxSizing: "border-box",
                          }}
                        >
                          {hasContent && hasVat ? `${r.vat_rate}` : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {p.totalPages > 1 && (
                <div style={{ textAlign: "right", fontSize: "8.5px", fontStyle: "italic", marginTop: "3px" }}>
                  Pagina {p.pageNum} di {p.totalPages}
                </div>
              )}
            </div>

            {/* ZONA INFERIORE: FOOTER TOTALI E LOGISTICA IDENTICO ALL'ORIGINALE (SOLO ULTIMA PAGINA) */}
            {p.isLast ? (
              <div style={{ paddingTop: "4px" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    border: "1px solid black",
                    tableLayout: "fixed",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <tbody>
                    {/* Riga 1: Totali (Colli, Peso, Totale Imponibile, Imposta, Totale Documento) */}
                    <tr style={{ height: DDT_CONFIG.footer.altezzaTotali, borderBottom: "1px solid black" }}>
                      {/* Colli */}
                      <td
                        style={{
                          width: "10%",
                          borderRight: "1px solid black",
                          padding: "3px 4px",
                          verticalAlign: "top",
                          textAlign: "left",
                          boxSizing: "border-box",
                        }}
                      >
                        <div style={{ fontSize: DDT_CONFIG.footer.fontSizeLabelTotali, fontStyle: "italic", color: "#3f3f46" }}>
                          Colli
                        </div>
                        <div
                          style={{
                            textAlign: "center",
                            fontStyle: "italic",
                            fontSize: "9.5px",
                            paddingTop: DDT_CONFIG.footer.paddingTopValori,
                          }}
                        >
                          {ddt.packages_count || ""}
                        </div>
                      </td>

                      {/* Peso Kg. */}
                      <td
                        style={{
                          width: "14%",
                          borderRight: "1px solid black",
                          padding: "3px 4px",
                          verticalAlign: "top",
                          textAlign: "left",
                          boxSizing: "border-box",
                        }}
                      >
                        <div style={{ fontSize: DDT_CONFIG.footer.fontSizeLabelTotali, fontStyle: "italic", color: "#3f3f46" }}>
                          Peso Kg.
                        </div>
                        <div
                          style={{
                            textAlign: "center",
                            fontStyle: "italic",
                            fontSize: "9.5px",
                            paddingTop: DDT_CONFIG.footer.paddingTopValori,
                          }}
                        >
                          {ddt.weight_kg || ""}
                        </div>
                      </td>

                      {/* Totale Imponibile */}
                      <td
                        style={{
                          width: "28%",
                          borderRight: "1px solid black",
                          padding: "3px 6px",
                          verticalAlign: "top",
                          textAlign: "left",
                          boxSizing: "border-box",
                        }}
                      >
                        <div style={{ fontSize: DDT_CONFIG.footer.fontSizeLabelTotali, fontStyle: "italic", color: "#3f3f46" }}>
                          Totale Imponibile
                        </div>
                        <div
                          style={{
                            textAlign: "center",
                            fontStyle: "italic",
                            fontSize: DDT_CONFIG.footer.fontSizeValoriTotali,
                            paddingTop: DDT_CONFIG.footer.paddingTopValori,
                          }}
                        >
                          {totals.totale_imponibile.formatIT(false)} €
                        </div>
                      </td>

                      {/* Imposta */}
                      <td
                        style={{
                          width: "24%",
                          borderRight: "1px solid black",
                          padding: "3px 6px",
                          verticalAlign: "top",
                          textAlign: "left",
                          boxSizing: "border-box",
                        }}
                      >
                        <div style={{ fontSize: DDT_CONFIG.footer.fontSizeLabelTotali, fontStyle: "italic", color: "#3f3f46" }}>
                          Imposta
                        </div>
                        <div
                          style={{
                            textAlign: "center",
                            fontStyle: "italic",
                            fontSize: DDT_CONFIG.footer.fontSizeValoriTotali,
                            paddingTop: DDT_CONFIG.footer.paddingTopValori,
                          }}
                        >
                          {totals.totale_iva.formatIT(false)} €
                        </div>
                      </td>

                      {/* Totale Documento */}
                      <td
                        style={{
                          width: "24%",
                          padding: "3px 6px",
                          verticalAlign: "top",
                          textAlign: "left",
                          boxSizing: "border-box",
                        }}
                      >
                        <div style={{ fontSize: DDT_CONFIG.footer.fontSizeLabelTotali, fontStyle: "italic", color: "#3f3f46" }}>
                          Totale Documento
                        </div>
                        <div
                          style={{
                            textAlign: "center",
                            fontStyle: "italic",
                            fontSize: DDT_CONFIG.footer.fontSizeValoriTotali,
                            paddingTop: DDT_CONFIG.footer.paddingTopValori,
                          }}
                        >
                          {totals.totale_documento.formatIT(false)} €
                        </div>
                      </td>
                    </tr>

                    {/* Riga 2: Aspetto esteriore dei beni (colspan 2) | Porto | Firma conducente (colspan 2) */}
                    <tr style={{ height: "30px", borderBottom: "1px solid black" }}>
                      <td
                        colSpan={2}
                        style={{
                          borderRight: "1px solid black",
                          padding: "2px 4px",
                          verticalAlign: "top",
                          textAlign: "left",
                          boxSizing: "border-box",
                        }}
                      >
                        <div style={{ fontSize: "8px", fontStyle: "italic", color: "#3f3f46" }}>
                          Aspetto esteriore dei beni:
                        </div>
                        <div style={{ fontSize: "8.5px", paddingLeft: "6px", marginTop: "2px", fontStyle: "italic" }}>
                          {ddt.goods_appearance || ""}
                        </div>
                      </td>

                      <td
                        style={{
                          borderRight: "1px solid black",
                          padding: "2px 6px",
                          verticalAlign: "top",
                          textAlign: "left",
                          boxSizing: "border-box",
                        }}
                      >
                        <div style={{ fontSize: "8px", fontStyle: "italic", color: "#3f3f46" }}>Porto</div>
                        <div style={{ textAlign: "center", fontSize: "8.5px", marginTop: "2px", fontStyle: "italic" }}>
                          {ddt.carriage_terms || "Franco stabilimento"}
                        </div>
                      </td>

                      <td
                        colSpan={2}
                        style={{
                          padding: "2px 6px",
                          verticalAlign: "top",
                          textAlign: "left",
                          boxSizing: "border-box",
                        }}
                      >
                        <div style={{ fontSize: "7.5px", fontStyle: "italic", color: "#3f3f46" }}>
                          Firma conducente:
                        </div>
                      </td>
                    </tr>

                    {/* Riga 3: VETTORE (colspan 2) | Data e ora del ritiro | Firma cessionario (colspan 2) */}
                    <tr style={{ height: "30px" }}>
                      <td
                        colSpan={2}
                        style={{
                          borderRight: "1px solid black",
                          padding: "2px 4px",
                          verticalAlign: "top",
                          textAlign: "left",
                          boxSizing: "border-box",
                        }}
                      >
                        <div style={{ fontSize: "8px", fontStyle: "italic", color: "#3f3f46" }}>VETTORE</div>
                        <div style={{ fontSize: "8.5px", paddingLeft: "6px", marginTop: "2px", fontStyle: "italic" }}>
                          {ddt.carrier || ""}
                        </div>
                      </td>

                      <td
                        style={{
                          borderRight: "1px solid black",
                          padding: "2px 4px",
                          verticalAlign: "top",
                          textAlign: "center",
                          boxSizing: "border-box",
                        }}
                      >
                        <div style={{ fontSize: "8px", fontStyle: "italic", color: "#3f3f46" }}>
                          Data e ora del ritiro
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "2px 8px",
                            fontSize: "7.5px",
                            fontStyle: "italic",
                            color: "#71717a",
                          }}
                        >
                          <span>Data:</span>
                          <span>Ora:</span>
                        </div>
                      </td>

                      <td
                        colSpan={2}
                        style={{
                          padding: "2px 6px",
                          verticalAlign: "top",
                          textAlign: "left",
                          boxSizing: "border-box",
                        }}
                      >
                        <div style={{ fontSize: "7.5px", fontStyle: "italic", color: "#3f3f46" }}>
                          Firma cessionario
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Piè di pagina aziendale con P.IVA e recapiti in corsivo */}
                <div
                  style={{
                    textAlign: "center",
                    fontSize: "10px",
                    fontStyle: "italic",
                    marginTop: "6px",
                    paddingTop: "2px",
                    borderTop: "1px solid #e4e4e7",
                    color: "#27272a",
                    letterSpacing: "-0.2px",
                  }}
                >
                  Via di Carraia, 218 - 55061 Carraia - Capannori (LU) Tel. 0583.980126 - Email: Bricoclass@live.it Cod. Univoco: M5UXCR1 - P.Iva e C.F: 01601690462
                </div>
              </div>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  fontSize: "10px",
                  fontStyle: "italic",
                  marginTop: "6px",
                  paddingTop: "2px",
                  borderTop: "1px solid #e4e4e7",
                  color: "#27272a",
                  letterSpacing: "-0.2px",
                }}
              >
                Via di Carraia, 218 - 55061 Carraia - Capannori (LU) Tel. 0583.980126 - Email: Bricoclass@live.it Cod. Univoco: M5UXCR1 - P.Iva e C.F: 01601690462
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }
);
