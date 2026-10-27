/**
 * Utility per la normalizzazione e l'accorpamento intelligente delle descrizioni articoli.
 * Consente di unificare descrizioni con sinonimi, abbreviazioni di confezionamento e formattazioni diverse.
 * 
 * Es:
 * "vite truc. zn 4x50"
 * "vite truc zn 4x50"
 * "vite truc zn 4x50 (sc)"
 * "vite truc. zn 4x50 (scatola)"
 * "vite truc zincata 4x50"
 * -> Vengono tutte unificate in: "VITE TRUC ZN 4X50"
 */

export function normalizeArticleDescription(desc: string): string {
  if (!desc) return "";

  let s = desc.toUpperCase();

  // 1. Rimuove parentesi e rumore di confezionamento/imballo
  // Rimozione esplicita di costrutti tra parentesi: (SC), (SCATOLA), (CONF.), (PZ), ecc.
  s = s.replace(/\s*\(\s*(SC|SCATOLA|SCATOLE|CONF|CONFEZIONE|BLISTER|PZ|PEZZI|CF|BUSTA|BUSTINE)\b[^)]*\)/gi, " ");
  s = s.replace(/\s*\(\s*[^)]*(SCATOLA|CONFEZIONE|PEZZI)[^)]*\)/gi, " ");

  // Rimozione parole singole di imballo isolate
  s = s.replace(/\b(SC|SCATOLA|SCATOLE|CONF|CONFEZIONE|BLISTER|PZ|PEZZI|CF)\b/gi, " ");

  // 2. Unificazione sinonimi finiture / trattamenti
  // Zincata / ZN
  s = s.replace(/\b(ZINCATA|ZINCATE|ZINCATO|ZINCATI|ZINC\b\.?|ZN\b\.?)/gi, "ZN");
  // Bronzata / BR
  s = s.replace(/\b(BRONZATA|BRONZATE|BRONZATO|BRONZATI|BRONZ\b\.?|BR\b\.?)/gi, "BR");
  // Tropicalizzata / TROP
  s = s.replace(/\b(TROPICALIZZATA|TROPICALIZZATE|TROPICALIZZATO|TROPICALIZZATI|TROP\b\.?)/gi, "TROP");
  // Brunita / BRUN
  s = s.replace(/\b(BRUNITA|BRUNITE|BRUNITO|BRUNITI|BRUN\b\.?)/gi, "BRUN");
  // Inox / AISI
  s = s.replace(/\b(INOX|AISI\s*304|AISI\s*316)\b/gi, "INOX");
  // Nichelata / NICHEL
  s = s.replace(/\b(NICHELATA|NICHELATE|NICHELATO|NICHELATI|NICHEL\b\.?)/gi, "NICHEL");
  // Ottonata / OTT
  s = s.replace(/\b(OTTONATA|OTTONATE|OTTONATO|OTTONATI|OTT\b\.?)/gi, "OTT");
  // Ramata
  s = s.replace(/\b(RAMATA|RAMATE|RAMATO|RAMATI)\b/gi, "RAMATA");
  // Fosfatata / FOSF
  s = s.replace(/\b(FOSFATATA|FOSFATATE|FOSF\b\.?)/gi, "FOSF");

  // 3. Normalizzazione abbreviazioni frequenti
  s = s.replace(/\bTRUC\./gi, "TRUC ");
  s = s.replace(/\bART\./gi, "ART ");
  s = s.replace(/\bPROF\./gi, "PROF ");
  s = s.replace(/\bDIAM\./gi, "DIAM ");
  s = s.replace(/\bLUNG\./gi, "LUNG ");
  s = s.replace(/\bMIS\./gi, "MIS ");

  // 4. Normalizzazione dimensioni (es: "4 X 50", "4X 50", "4 X50" -> "4X50")
  s = s.replace(/(\d+)\s*[xX]\s*(\d+)/g, "$1X$2");

  // 5. Pulizia punteggiatura (punti, virgole, trattini isolati, parentesi rimaste)
  s = s.replace(/[.,;:"'()[\]{}*]/g, " ");
  s = s.replace(/\s+-\s+/g, " ");

  // 6. Normalizzazione spazi multipli e trim finale
  s = s.replace(/\s+/g, " ").trim();

  return s;
}
