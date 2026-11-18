import { afterEach, describe, expect, it } from "vitest";
import { extractInvoiceXmlText, parseInvoiceXmlAll } from "../invoiceXmlParser";

class SimpleXmlEl {
  nodeName: string;
  localName: string;
  textContent: string;
  children: SimpleXmlEl[] = [];

  constructor(nodeName: string) {
    this.nodeName = nodeName;
    this.localName = nodeName.includes(":") ? nodeName.split(":").pop()! : nodeName;
    this.textContent = "";
  }

  getElementsByTagName(tag: string): SimpleXmlEl[] {
    if (tag !== "*") return [];
    const out: SimpleXmlEl[] = [];
    const walk = (el: SimpleXmlEl) => {
      for (const ch of el.children) {
        out.push(ch);
        walk(ch);
      }
    };
    walk(this);
    return out;
  }
}

class MiniDomParser {
  parseFromString(xml: string) {
    const root = new SimpleXmlEl("#document");
    const stack: SimpleXmlEl[] = [root];
    const tokenRe = /<(\/?)([A-Za-z0-9_:-]+)(?:\s+[^>]*)?(\/?)>|([^<]+)/g;
    let match: RegExpExecArray | null;
    while ((match = tokenRe.exec(xml)) !== null) {
      if (match[4] !== undefined) {
        const text = match[4];
        if (stack.length > 1) {
          stack[stack.length - 1].textContent += text;
        }
        continue;
      }
      const [, isClose, tagName, isSelfClose] = match;
      if (tagName.startsWith("?")) continue;
      if (isClose) {
        if (stack.length > 1) {
          const popped = stack.pop()!;
          stack[stack.length - 1].textContent += popped.textContent;
        }
      } else {
        const el = new SimpleXmlEl(tagName);
        stack[stack.length - 1].children.push(el);
        if (!isSelfClose) {
          stack.push(el);
        }
      }
    }
    return {
      querySelector: () => null,
      getElementsByTagName: (tag: string) => root.getElementsByTagName(tag),
    };
  }
}

describe("invoiceXmlParser", () => {
  const originalDomParser = globalThis.DOMParser;

  afterEach(() => {
    globalThis.DOMParser = originalDomParser;
  });

  it("extracts XML from BER chunked PKCS#7 .p7m and Base64 envelopes without corrupting tags", () => {
    const xml = "<FatturaElettronica><FatturaElettronicaBody><Numero>10</Numero></FatturaElettronicaBody></FatturaElettronica>";
    const xmlBytes = new TextEncoder().encode(xml);
    const part1 = xmlBytes.subarray(0, 40);
    const part2 = xmlBytes.subarray(40);
    const oid = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01];
    // SignedData prefix + id-data OID + [0] indefinite + 0x24 indefinite + 2 chunks + EOCs + trailing binary
    const p7mBytes = new Uint8Array([
      0x30, 0x80,
      ...oid,
      0xa0, 0x80,
      0x24, 0x80,
      0x04, part1.length, ...part1,
      0x04, part2.length, ...part2,
      0x00, 0x00,
      0x00, 0x00,
      0xde, 0xad, 0xbe, 0xef,
    ]);

    expect(extractInvoiceXmlText(p7mBytes, "test.xml.p7m")).toBe(xml);
    const b64 = Buffer.from(p7mBytes).toString("base64");
    expect(extractInvoiceXmlText(b64, "test_b64.p7m")).toBe(xml);
  });

  it("parses multiple bodies, MG surcharges, Importo discounts, 0-total omaggi, and 0% VAT", () => {
    globalThis.DOMParser = MiniDomParser as unknown as typeof DOMParser;

    const multiXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>FORNITORE BETA SRL</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <Data>2026-11-10</Data>
        <Numero>FT-1</Numero>
        <ImportoTotaleDocumento>105.00</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee>
        <NumeroLinea>1</NumeroLinea>
        <Descrizione>ARTICOLO CON MAGGIORAZIONE</Descrizione>
        <Quantita>1</Quantita>
        <PrezzoUnitario>100.00</PrezzoUnitario>
        <ScontoMaggiorazione><Tipo>MG</Tipo><Percentuale>5.00</Percentuale></ScontoMaggiorazione>
        <PrezzoTotale>105.00</PrezzoTotale>
        <AliquotaIVA>0.00</AliquotaIVA>
      </DettaglioLinee>
      <DettaglioLinee>
        <NumeroLinea>2</NumeroLinea>
        <Descrizione>OMAGGIO</Descrizione>
        <Quantita>2</Quantita>
        <PrezzoUnitario>15.00</PrezzoUnitario>
        <PrezzoTotale>0.00</PrezzoTotale>
        <AliquotaIVA>0.00</AliquotaIVA>
      </DettaglioLinee>
      <DettaglioLinee>
        <NumeroLinea>3</NumeroLinea>
        <Descrizione>SCONTO IN IMPORTO</Descrizione>
        <Quantita>1</Quantita>
        <PrezzoUnitario>50.00</PrezzoUnitario>
        <ScontoMaggiorazione><Tipo>SC</Tipo><Importo>10.00</Importo></ScontoMaggiorazione>
        <PrezzoTotale>40.00</PrezzoTotale>
        <AliquotaIVA>22.00</AliquotaIVA>
      </DettaglioLinee>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <Data>2026-11-11</Data>
        <Numero>FT-2</Numero>
        <ImportoTotaleDocumento>24.40</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee>
        <NumeroLinea>1</NumeroLinea>
        <Descrizione>SECONDA FATTURA NEL LOTTO</Descrizione>
        <Quantita>1</Quantita>
        <PrezzoUnitario>20.00</PrezzoUnitario>
        <PrezzoTotale>20.00</PrezzoTotale>
        <AliquotaIVA>22.00</AliquotaIVA>
      </DettaglioLinee>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;

    const results = parseInvoiceXmlAll(multiXml, "lotto.xml");
    expect(results).toHaveLength(2);
    expect(results[0].invoice.doc_number).toBe("FT-1");
    expect(results[1].invoice.doc_number).toBe("FT-2");

    // Line 1: MG 5% -> discounted_price 105, discount_1 = -5, vat_rate = 0 (not 22!)
    expect(results[0].items[0].discounted_price).toBe(105);
    expect(results[0].items[0].discount_1).toBe(-5);
    expect(results[0].items[0].vat_rate).toBe(0);

    // Line 2: Omaggio PrezzoTotale = 0 preserved, vat_rate = 0
    expect(results[0].items[1].total_price).toBe(0);
    expect(results[0].items[1].vat_rate).toBe(0);

    // Line 3: SC Importo 10 on 50 -> discounted_price = 40, discount_1 = 20%
    expect(results[0].items[2].discounted_price).toBe(40);
    expect(results[0].items[2].discount_1).toBe(20);
  });
});
