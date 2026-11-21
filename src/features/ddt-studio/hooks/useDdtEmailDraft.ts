import { useEffect, useState } from "react";
import type { DdtDocument } from "../models/ddt";
import { ddtRepository } from "../services/ddtRepository";
import { clientRepository } from "@/features/clients/services/clientRepository";
import { getEmailSettings } from "@/features/settings/emailSettingsRepository";
import { getCompanySettings } from "@/features/settings/companySettingsRepository";

export function useDdtEmailDraft(isOpen: boolean, selectedDdtIds: string[]) {
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [docs, setDocs] = useState<DdtDocument[]>([]);
  const [toEmail, setToEmail] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isOpen || selectedDdtIds.length === 0) return;
    let active = true;
    setLoadingDocs(true);
    setErrorMessage("");

    (async () => {
      try {
        const loaded: DdtDocument[] = [];
        for (const id of selectedDdtIds) {
          const doc = await ddtRepository.getDdtById(id);
          if (doc) loaded.push(doc);
        }
        if (!active) return;
        setDocs(loaded);

        if (loaded.length > 0) {
          const first = loaded[0];
          const clientName = first.client_name || "Cliente";
          let destTo = "";
          let destCc = "";
          const [emailConfig, companySettings] = await Promise.all([
            getEmailSettings(),
            getCompanySettings(),
          ]);

          if (clientName.toUpperCase().includes("CARRARA")) {
            destTo = emailConfig.carrara_to;
            destCc = emailConfig.carrara_cc;
          } else if (clientName.toUpperCase().includes("WEPA")) {
            const isSalanetti = loaded.some((doc) =>
              (doc.destination_name || doc.destination_address || "").toUpperCase().includes("SALANETTI")
            );
            if (isSalanetti) {
              destTo = emailConfig.wepa_salanetti_to;
              destCc = emailConfig.wepa_salanetti_cc;
            } else {
              destTo = emailConfig.wepa_ralletta_to;
              destCc = emailConfig.wepa_ralletta_cc;
            }
          } else if (first.client_id) {
            const client = await clientRepository.getClientById(first.client_id);
            if (client?.email) destTo = client.email;
            if (companySettings?.email) destCc = companySettings.email;
          }

          setToEmail(destTo);
          setCcEmail(destCc);
          const docNumbers = loaded.map((doc) => `DDT ${doc.doc_number ?? "Bozza"}`).join(", ");
          setSubject(`Invio ${docNumbers} — Brico Class`);
          const now = new Date();
          const timeValue = now.getHours() * 100 + now.getMinutes();
          const greeting = timeValue > 0 && timeValue <= 1230 ? "Buongiorno." : "Buonasera.";
          const ddtLines = loaded
            .map((doc) => `• DDT ${doc.doc_number ?? "Bozza"} del ${doc.doc_date || ""} ${doc.destination_address ? `(${doc.destination_address})` : ""}`)
            .join("\n");
          setBodyText(`${greeting}\n\nIn allegato i seguenti DDT in formato PDF:\n${ddtLines}\n\nRestiamo a disposizione per qualsiasi chiarimento.\n\nCordiali saluti,\nBrico Class S.r.l.`);
        }
      } catch (error) {
        if (!active) return;
        console.error("Errore caricamento DDT per email:", error);
        setErrorMessage("Errore nel caricamento dei dati dei DDT selezionati.");
      } finally {
        if (active) setLoadingDocs(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen, selectedDdtIds]);

  return {
    loadingDocs,
    docs,
    toEmail,
    setToEmail,
    ccEmail,
    setCcEmail,
    subject,
    setSubject,
    bodyText,
    setBodyText,
    errorMessage,
    setErrorMessage,
  };
}
