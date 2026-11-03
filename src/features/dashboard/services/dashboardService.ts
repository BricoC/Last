import { getDatabase } from "@/shared/data-layer/database";
import { tokenizeSearch } from "@/shared/hooks/useFragmentSearch";
import { normalizeArticleDescription } from "@/features/ddt-studio/utils/articleDescriptionNormalizer";
import type { DdtListViewRow } from "@/features/ddt-studio/services/ddtReadModelsRepository";

export type { DdtListViewRow };

export interface MonthlyMetric {
  month: number; // 1 - 12
  turnover: number; // in euro (€)
  cost: number;
  margin: number;
  ddtCount: number;
}

export interface ClientTurnoverRow {
  clientName: string;
  turnoverByYear: Record<number, number>;
  totalTurnover: number;
  ddtCountByYear: Record<number, number>;
}

export interface DashboardRecentDdt {
  id: string;
  docNumber: number | null;
  series: string;
  docDate: string;
  clientName: string;
  totalDocument: number;
  hasCompleteMargins: boolean;
}

export interface TopArticleItem {
  code: string;
  description: string;
  totalQuantity: number;
  totalTurnover: number;
}

export interface MonthPerformanceDetail {
  month: number;
  monthName: string;
  year: number;
  turnover: number;
  cost: number;
  margin: number;
  marginPercent: number; // Margine % sul fatturato ((turnover - cost) / turnover) * 100
  markupPercent: number; // Ricarico % sul costo ((turnover - cost) / cost) * 100
  ddtCount: number;
  averageTicket: number;
  prevYearTurnover: number;
  deltaPercentVsPrevYear: number | null;
}

export interface DailyMetric {
  day: number;
  turnover: number;
  ddtCount: number;
  cumulative: number;
}

export interface MonthDailyBreakdown {
  month: number;
  monthName: string;
  daysInMonth: number;
  availableYears: number[];
  dailyByYear: Record<number, DailyMetric[]>;
  totalsByYear: Record<
    number,
    {
      totalTurnover: number;
      totalDdtCount: number;
      bestDay: { day: number; turnover: number };
      averageDailyTurnover: number;
    }
  >;
}

export interface MonthlyPerformanceReport {
  year: number;
  cutoffDay: number | null;
  totalTurnover: number;
  totalCost: number;
  totalMargin: number;
  averageMarginPercent: number; // Margine medio sul fatturato (%)
  averageMarkupPercent: number; // Ricarico medio sul costo (%)
  averageMonthlyTurnover: number;
  totalDdtCount: number;
  months: MonthPerformanceDetail[];
}

export interface YtdComparisonItem {
  year: number;
  turnover: number;
  ddtCount: number;
  deltaPercent: number | null;
}

export interface DashboardYtdMetrics {
  cutoffDay: number;
  cutoffMonth: number;
  cutoffDateFormatted: string; // es. "3 Novembre"
  currentYearTurnover: number;
  prevYearTurnover: number;
  deltaPercentVsPrevYear: number | null;
  historyComparisons: YtdComparisonItem[];
}

export interface DashboardData {
  availableYears: number[];
  kpis: {
    currentYearTurnover: number;
    prevYearTurnover: number;
    currentMonthTurnover: number;
    prevYearSameMonthTurnover: number;
    currentYearDdtCount: number;
    activeDraftsCount: number;
    averageMarginPercent: number | null;
    currentMonthCost: number;
    currentMonthMarginPercent: number | null;
    ytd: DashboardYtdMetrics;
  };
  monthlyByYear: Record<number, MonthlyMetric[]>;
  clientMatrix: ClientTurnoverRow[];
  recentDdts: DashboardRecentDdt[];
  topArticles: TopArticleItem[];
}

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];

export class DashboardService {
  public async getDashboardData(): Promise<DashboardData> {
    const db = await getDatabase();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const prevYear = currentYear - 1;

    // 1. Recupero anni disponibili
    const yearRows = await db.select<{ year: number }[]>(
      `SELECT DISTINCT year 
       FROM ddt_documents 
       WHERE deleted_at IS NULL AND year IS NOT NULL AND status <> 'bozza'
       ORDER BY year DESC`
    );
    const dbYears = yearRows.map((r) => Number(r.year)).filter((y) => !isNaN(y) && y > 0);
    const defaultYears = [currentYear, prevYear, currentYear - 2, 2023];
    const availableYears = Array.from(new Set([...defaultYears, ...dbYears])).sort((a, b) => b - a);

    // 2. Dati mensili per ciascun anno (Turnover + DDT Count)
    const monthlyRows = await db.select<{
      year: number;
      month: number;
      ddt_count: number;
      turnover_subunits: number;
    }[]>(
      `SELECT 
         year,
         CAST(strftime('%m', doc_date) AS INTEGER) AS month,
         COUNT(id) AS ddt_count,
         SUM(total_taxable_subunits) AS turnover_subunits
       FROM ddt_documents
       WHERE deleted_at IS NULL 
         AND status <> 'bozza'
         AND doc_number IS NOT NULL
         AND year IS NOT NULL
       GROUP BY year, month
       ORDER BY year ASC, month ASC`
    );

    // 2b. Costi e Margini mensili per anno
    const costRows = await db.select<{
      year: number;
      month: number;
      cost_subunits: number;
      net_subunits: number;
    }[]>(
      `SELECT 
         d.year,
         CAST(strftime('%m', d.doc_date) AS INTEGER) AS month,
         SUM(i.net_amount_subunits) AS net_subunits,
         SUM(CAST(i.purchase_price_subunits AS REAL) * CAST(REPLACE(i.quantity, ',', '.') AS REAL)) AS cost_subunits
       FROM ddt_items i
       JOIN ddt_documents d ON d.id = i.ddt_id
       WHERE d.deleted_at IS NULL 
         AND i.deleted_at IS NULL
         AND d.status <> 'bozza'
         AND d.doc_number IS NOT NULL
       GROUP BY d.year, month`
    );

    const costMap = new Map<string, { cost: number; net: number }>();
    for (const r of costRows) {
      costMap.set(`${r.year}-${r.month}`, {
        cost: (Number(r.cost_subunits) || 0) / 100000,
        net: (Number(r.net_subunits) || 0) / 100000,
      });
    }

    const monthlyByYear: Record<number, MonthlyMetric[]> = {};
    for (const yr of availableYears) {
      monthlyByYear[yr] = Array.from({ length: 12 }, (_, idx) => ({
        month: idx + 1,
        turnover: 0,
        cost: 0,
        margin: 0,
        ddtCount: 0,
      }));
    }

    for (const row of monthlyRows) {
      const yr = Number(row.year);
      const m = Number(row.month);
      if (monthlyByYear[yr] && m >= 1 && m <= 12) {
        const turnover = (Number(row.turnover_subunits) || 0) / 100000;
        const costEntry = costMap.get(`${yr}-${m}`);
        const cost = costEntry ? costEntry.cost : 0;
        const margin = turnover > 0 && cost > 0 ? turnover - cost : 0;

        monthlyByYear[yr][m - 1] = {
          month: m,
          turnover,
          cost,
          margin,
          ddtCount: Number(row.ddt_count) || 0,
        };
      }
    }

    // 3. Matrice Clienti per Anno
    const clientRows = await db.select<{
      client_name: string;
      year: number;
      turnover_subunits: number;
      ddt_count: number;
    }[]>(
      `SELECT 
         TRIM(client_name) AS client_name,
         year,
         SUM(total_taxable_subunits) AS turnover_subunits,
         COUNT(id) AS ddt_count
       FROM ddt_documents
       WHERE deleted_at IS NULL 
         AND status <> 'bozza'
         AND doc_number IS NOT NULL
         AND client_name IS NOT NULL 
         AND TRIM(client_name) <> ''
       GROUP BY TRIM(client_name), year
       ORDER BY TRIM(client_name) ASC`
    );

    const clientMap = new Map<string, { turnoverByYear: Record<number, number>; ddtCountByYear: Record<number, number>; total: number }>();
    for (const r of clientRows) {
      const name = r.client_name;
      const yr = Number(r.year);
      const val = (Number(r.turnover_subunits) || 0) / 100000;
      const count = Number(r.ddt_count) || 0;

      if (!clientMap.has(name)) {
        clientMap.set(name, { turnoverByYear: {}, ddtCountByYear: {}, total: 0 });
      }
      const entry = clientMap.get(name)!;
      entry.turnoverByYear[yr] = (entry.turnoverByYear[yr] || 0) + val;
      entry.ddtCountByYear[yr] = (entry.ddtCountByYear[yr] || 0) + count;
      entry.total += val;
    }

    const clientMatrix: ClientTurnoverRow[] = Array.from(clientMap.entries())
      .map(([clientName, data]) => ({
        clientName,
        turnoverByYear: data.turnoverByYear,
        totalTurnover: data.total,
        ddtCountByYear: data.ddtCountByYear,
      }))
      .sort((a, b) => b.totalTurnover - a.totalTurnover);

    // 4. Ultime DDT Emesse (ultime 50)
    const recentDdtRows = await db.select<{
      id: string;
      doc_number: number | null;
      series: string;
      doc_date: string;
      client_name: string;
      total_document_subunits: number;
    }[]>(
      `SELECT id, doc_number, series, doc_date, client_name, total_document_subunits
       FROM ddt_documents
       WHERE deleted_at IS NULL AND doc_number IS NOT NULL AND status <> 'bozza'
       ORDER BY doc_date DESC, doc_number DESC
       LIMIT 50`
    );

    // Controllo margini per questi recenti
    const ddtIds = recentDdtRows.map((r) => `'${r.id}'`).join(",");
    const marginCheckMap = new Map<string, boolean>();
    if (ddtIds.length > 0) {
      const marginSummary = await db.select<{ ddt_id: string; has_cost: number }[]>(
        `SELECT ddt_id, MIN(CASE WHEN unit_price_subunits > 0 THEN (purchase_price_subunits > 0) ELSE 1 END) AS has_cost
         FROM ddt_items
         WHERE deleted_at IS NULL AND ddt_id IN (${ddtIds})
         GROUP BY ddt_id`
      );
      marginSummary.forEach((m) => {
        marginCheckMap.set(m.ddt_id, Number(m.has_cost) === 1);
      });
    }

    const recentDdts: DashboardRecentDdt[] = recentDdtRows.map((r) => ({
      id: r.id,
      docNumber: r.doc_number,
      series: r.series || "",
      docDate: r.doc_date,
      clientName: r.client_name,
      totalDocument: (Number(r.total_document_subunits) || 0) / 100000,
      hasCompleteMargins: marginCheckMap.get(r.id) ?? false,
    }));

    // 5. Bozze attive
    const draftsRes = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) AS count 
       FROM ddt_documents 
       WHERE deleted_at IS NULL AND (status = 'bozza' OR doc_number IS NULL)`
    );
    const activeDraftsCount = Number(draftsRes[0]?.count) || 0;

    // 6. Top Articoli più movimentati dell'anno corrente
    const topArticles = await this.searchArticles("", currentYear);

    // 7. Calcolo KPI riepilogativi
    const currentYearMonths = monthlyByYear[currentYear] || [];
    const prevYearMonths = monthlyByYear[prevYear] || [];

    const currentYearTurnover = currentYearMonths.reduce((acc, m) => acc + m.turnover, 0);
    const prevYearTurnover = prevYearMonths.reduce((acc, m) => acc + m.turnover, 0);
    const currentYearDdtCount = currentYearMonths.reduce((acc, m) => acc + m.ddtCount, 0);

    const currentMonthTurnover = currentYearMonths[currentMonth - 1]?.turnover || 0;
    const prevYearSameMonthTurnover = prevYearMonths[currentMonth - 1]?.turnover || 0;
    const currentMonthCost = currentYearMonths[currentMonth - 1]?.cost || 0;
    const currentMonthMarginPercent =
      currentMonthTurnover > 0 && currentMonthCost > 0
        ? ((currentMonthTurnover - currentMonthCost) / currentMonthTurnover) * 100
        : null;

    const totalCurrentCost = currentYearMonths.reduce((acc, m) => acc + m.cost, 0);
    const averageMarginPercent =
      currentYearTurnover > 0 && totalCurrentCost > 0
        ? ((currentYearTurnover - totalCurrentCost) / currentYearTurnover) * 100
        : null;

    // 8. Calcolo metriche YTD (Year-To-Date fino alla data odierna gg/mm per ciascun anno)
    const currentDay = now.getDate();
    const cutoffDateFormatted = `${currentDay} ${MONTH_NAMES[currentMonth - 1]}`;

    const ytdRows = await db.select<{
      year: number;
      turnover_subunits: number;
      ddt_count: number;
    }[]>(
      `SELECT 
         year,
         SUM(total_taxable_subunits) AS turnover_subunits,
         COUNT(id) AS ddt_count
       FROM ddt_documents
       WHERE deleted_at IS NULL 
         AND status <> 'bozza'
         AND doc_number IS NOT NULL
         AND year IS NOT NULL
         AND (
           CAST(strftime('%m', doc_date) AS INTEGER) < $1
           OR (
             CAST(strftime('%m', doc_date) AS INTEGER) = $1
             AND CAST(strftime('%d', doc_date) AS INTEGER) <= $2
           )
         )
       GROUP BY year
       ORDER BY year DESC`,
      [currentMonth, currentDay]
    );

    const ytdMap = new Map<number, { turnover: number; ddtCount: number }>();
    ytdRows.forEach((r) => {
      ytdMap.set(Number(r.year), {
        turnover: (Number(r.turnover_subunits) || 0) / 100000,
        ddtCount: Number(r.ddt_count) || 0,
      });
    });

    const currentYearYtd = ytdMap.get(currentYear)?.turnover ?? currentYearTurnover;
    const prevYearYtd = ytdMap.get(prevYear)?.turnover ?? 0;
    const ytdDeltaVsPrev =
      prevYearYtd > 0 ? ((currentYearYtd - prevYearYtd) / prevYearYtd) * 100 : null;

    const pastYears = availableYears.filter((y) => y < currentYear);
    const historyComparisons: YtdComparisonItem[] = pastYears.map((pastY) => {
      const pastData = ytdMap.get(pastY) || { turnover: 0, ddtCount: 0 };
      const deltaPercent =
        pastData.turnover > 0
          ? ((currentYearYtd - pastData.turnover) / pastData.turnover) * 100
          : null;
      return {
        year: pastY,
        turnover: pastData.turnover,
        ddtCount: pastData.ddtCount,
        deltaPercent,
      };
    });

    const ytd: DashboardYtdMetrics = {
      cutoffDay: currentDay,
      cutoffMonth: currentMonth,
      cutoffDateFormatted,
      currentYearTurnover: currentYearYtd,
      prevYearTurnover: prevYearYtd,
      deltaPercentVsPrevYear: ytdDeltaVsPrev,
      historyComparisons,
    };

    return {
      availableYears,
      kpis: {
        currentYearTurnover,
        prevYearTurnover,
        currentMonthTurnover,
        prevYearSameMonthTurnover,
        currentYearDdtCount,
        activeDraftsCount,
        averageMarginPercent,
        currentMonthCost,
        currentMonthMarginPercent,
        ytd,
      },
      monthlyByYear,
      clientMatrix,
      recentDdts,
      topArticles,
    };
  }

  /**
   * Ricerca live di articoli nel database SQLite
   */
  public async searchArticles(query: string, year?: number): Promise<TopArticleItem[]> {
    const db = await getDatabase();
    const trimmed = query.trim();
    const params: (string | number)[] = [];
    let sql = `
      SELECT 
        COALESCE(i.code, '') AS code,
        i.description,
        SUM(CAST(REPLACE(i.quantity, ',', '.') AS REAL)) AS total_qty,
        SUM(i.net_amount_subunits) AS total_turnover_subunits
      FROM ddt_items i
      JOIN ddt_documents d ON d.id = i.ddt_id
      WHERE d.deleted_at IS NULL 
        AND i.deleted_at IS NULL
        AND d.status <> 'bozza'
        AND TRIM(i.description) <> ''
    `;

    if (year) {
      params.push(year);
      sql += ` AND d.year = $${params.length}`;
    }

    if (trimmed) {
      const tokens = tokenizeSearch(trimmed);
      for (const token of tokens) {
        params.push(`%${token}%`);
        const pIdx = params.length;
        sql += ` AND (i.description LIKE $${pIdx} OR (i.code IS NOT NULL AND i.code LIKE $${pIdx}))`;
      }
    }

    sql += ` GROUP BY i.description ORDER BY total_qty DESC LIMIT 100`;

    const rows = await db.select<{
      code: string;
      description: string;
      total_qty: number;
      total_turnover_subunits: number;
    }[]>(sql, params);

    // Accorpa le varianti simili (come nello Storico Articoli) per mostrare i totali consolidati
    const map = new Map<
      string,
      { code: string; description: string; totalQuantity: number; totalTurnover: number }
    >();

    for (const r of rows) {
      const canonical =
        normalizeArticleDescription(r.description) || r.description.trim().toUpperCase();
      const existing = map.get(canonical);
      const qty = Math.round(Number(r.total_qty) || 0);
      const turnover = (Number(r.total_turnover_subunits) || 0) / 100000;

      if (!existing) {
        map.set(canonical, {
          code: r.code || "",
          description: canonical,
          totalQuantity: qty,
          totalTurnover: turnover,
        });
      } else {
        existing.totalQuantity += qty;
        existing.totalTurnover += turnover;
        if (!existing.code && r.code) existing.code = r.code;
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 15);
  }

  /**
   * Recupera i DDT per un mese e anno specifici
   */
  public async getDdtsForMonth(year: number, month: number): Promise<DashboardRecentDdt[]> {
    const db = await getDatabase();
    const rows = await db.select<{
      id: string;
      doc_number: number | null;
      series: string;
      doc_date: string;
      client_name: string;
      total_document_subunits: number;
    }[]>(
      `SELECT id, doc_number, series, doc_date, client_name, total_document_subunits
       FROM ddt_documents
       WHERE deleted_at IS NULL AND doc_number IS NOT NULL AND status <> 'bozza'
         AND year = $1
         AND CAST(strftime('%m', doc_date) AS INTEGER) = $2
       ORDER BY doc_date DESC, doc_number DESC`,
      [year, month]
    );

    if (rows.length === 0) return [];

    const ddtIds = rows.map((r) => `'${r.id}'`).join(",");
    const marginCheckMap = new Map<string, boolean>();
    if (ddtIds.length > 0) {
      const marginSummary = await db.select<{ ddt_id: string; has_cost: number }[]>(
        `SELECT ddt_id, MIN(CASE WHEN unit_price_subunits > 0 THEN (purchase_price_subunits > 0) ELSE 1 END) AS has_cost
         FROM ddt_items
         WHERE deleted_at IS NULL AND ddt_id IN (${ddtIds})
         GROUP BY ddt_id`
      );
      marginSummary.forEach((m) => {
        marginCheckMap.set(m.ddt_id, Number(m.has_cost) === 1);
      });
    }

    return rows.map((r) => ({
      id: r.id,
      docNumber: r.doc_number,
      series: r.series || "",
      docDate: r.doc_date,
      clientName: r.client_name,
      totalDocument: (Number(r.total_document_subunits) || 0) / 100000,
      hasCompleteMargins: marginCheckMap.get(r.id) ?? false,
    }));
  }

  /**
   * Report Rendimento Economico Mensile con filtro giorno opzionale (cutoffDay)
   */
  public async getMonthlyPerformanceReport(
    year: number,
    cutoffDay?: number | null
  ): Promise<MonthlyPerformanceReport> {
    const db = await getDatabase();
    const prevYear = year - 1;

    // Helper per estrarre vendite per mese con cutoff day
    const fetchYearTurnover = async (targetYear: number) => {
      let sql = `
        SELECT 
          CAST(strftime('%m', doc_date) AS INTEGER) AS month,
          COUNT(id) AS ddt_count,
          SUM(total_taxable_subunits) AS turnover_subunits
        FROM ddt_documents
        WHERE deleted_at IS NULL 
          AND status <> 'bozza'
          AND doc_number IS NOT NULL
          AND year = $1
      `;
      const params: (number | string)[] = [targetYear];

      if (cutoffDay && cutoffDay >= 1 && cutoffDay <= 31) {
        params.push(cutoffDay);
        sql += ` AND CAST(strftime('%d', doc_date) AS INTEGER) <= $${params.length}`;
      }

      sql += ` GROUP BY month ORDER BY month ASC`;
      return db.select<{ month: number; ddt_count: number; turnover_subunits: number }[]>(sql, params);
    };

    // Helper per estrarre costi per mese con cutoff day
    const fetchYearCosts = async (targetYear: number) => {
      let sql = `
        SELECT 
          CAST(strftime('%m', d.doc_date) AS INTEGER) AS month,
          SUM(CAST(i.purchase_price_subunits AS REAL) * CAST(REPLACE(i.quantity, ',', '.') AS REAL)) AS cost_subunits
        FROM ddt_items i
        JOIN ddt_documents d ON d.id = i.ddt_id
        WHERE d.deleted_at IS NULL 
          AND i.deleted_at IS NULL
          AND d.status <> 'bozza'
          AND d.doc_number IS NOT NULL
          AND d.year = $1
      `;
      const params: (number | string)[] = [targetYear];

      if (cutoffDay && cutoffDay >= 1 && cutoffDay <= 31) {
        params.push(cutoffDay);
        sql += ` AND CAST(strftime('%d', d.doc_date) AS INTEGER) <= $${params.length}`;
      }

      sql += ` GROUP BY month ORDER BY month ASC`;
      return db.select<{ month: number; cost_subunits: number }[]>(sql, params);
    };

    const [currentTurnovers, prevTurnovers, currentCosts] = await Promise.all([
      fetchYearTurnover(year),
      fetchYearTurnover(prevYear),
      fetchYearCosts(year),
    ]);

    const turnoverMap = new Map<number, { turnover: number; ddtCount: number }>();
    currentTurnovers.forEach((r) => {
      turnoverMap.set(Number(r.month), {
        turnover: (Number(r.turnover_subunits) || 0) / 100000,
        ddtCount: Number(r.ddt_count) || 0,
      });
    });

    const prevTurnoverMap = new Map<number, number>();
    prevTurnovers.forEach((r) => {
      prevTurnoverMap.set(Number(r.month), (Number(r.turnover_subunits) || 0) / 100000);
    });

    const costMap = new Map<number, number>();
    currentCosts.forEach((r) => {
      costMap.set(Number(r.month), (Number(r.cost_subunits) || 0) / 100000);
    });

    const months: MonthPerformanceDetail[] = Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1;
      const monthName = MONTH_NAMES[i];
      const cur = turnoverMap.get(monthNum) || { turnover: 0, ddtCount: 0 };
      const prevTurn = prevTurnoverMap.get(monthNum) || 0;
      const cost = costMap.get(monthNum) || 0;
      const margin = cur.turnover > 0 && cost > 0 ? cur.turnover - cost : 0;
      const marginPercent = cur.turnover > 0 && cost > 0 ? (margin / cur.turnover) * 100 : 0;
      const markupPercent = cost > 0 ? (margin / cost) * 100 : 0;
      const averageTicket = cur.ddtCount > 0 ? cur.turnover / cur.ddtCount : 0;
      const deltaPercentVsPrevYear =
        prevTurn > 0 ? ((cur.turnover - prevTurn) / prevTurn) * 100 : null;

      return {
        month: monthNum,
        monthName,
        year,
        turnover: cur.turnover,
        cost,
        margin,
        marginPercent,
        markupPercent,
        ddtCount: cur.ddtCount,
        averageTicket,
        prevYearTurnover: prevTurn,
        deltaPercentVsPrevYear,
      };
    });

    const totalTurnover = months.reduce((acc, m) => acc + m.turnover, 0);
    const totalCost = months.reduce((acc, m) => acc + m.cost, 0);
    const totalMargin = totalTurnover > 0 && totalCost > 0 ? totalTurnover - totalCost : 0;
    const averageMarginPercent = totalTurnover > 0 && totalCost > 0 ? (totalMargin / totalTurnover) * 100 : 0;
    const averageMarkupPercent = totalCost > 0 ? (totalMargin / totalCost) * 100 : 0;
    const totalDdtCount = months.reduce((acc, m) => acc + m.ddtCount, 0);

    const activeMonthsCount = months.filter((m) => m.turnover > 0).length || 1;
    const averageMonthlyTurnover = totalTurnover / activeMonthsCount;

    return {
      year,
      cutoffDay: cutoffDay || null,
      totalTurnover,
      totalCost,
      totalMargin,
      averageMarginPercent,
      averageMarkupPercent,
      averageMonthlyTurnover,
      totalDdtCount,
      months,
    };
  }

  /**
   * Analisi giornaliera di un mese specifico a confronto tra tutti gli anni (giorno per giorno e cumulativo)
   */
  public async getMonthDailyBreakdown(month: number): Promise<MonthDailyBreakdown> {
    const db = await getDatabase();
    const now = new Date();
    const currentYear = now.getFullYear();

    const daysInMonth = [4, 6, 9, 11].includes(month) ? 30 : month === 2 ? 29 : 31;

    // Recupera anni disponibili
    const yearRows = await db.select<{ year: number }[]>(
      `SELECT DISTINCT year FROM ddt_documents WHERE deleted_at IS NULL AND year IS NOT NULL AND status <> 'bozza' ORDER BY year DESC`
    );
    const dbYears = yearRows.map((r) => Number(r.year)).filter((y) => !isNaN(y) && y > 0);
    const availableYears = Array.from(new Set([currentYear, currentYear - 1, currentYear - 2, 2023, ...dbYears])).sort(
      (a, b) => b - a
    );

    // Query per i movimenti di quel mese per giorno per ciascun anno
    const dailyRows = await db.select<{
      year: number;
      day: number;
      ddt_count: number;
      turnover_subunits: number;
    }[]>(
      `SELECT 
         year,
         CAST(strftime('%d', doc_date) AS INTEGER) AS day,
         COUNT(id) AS ddt_count,
         SUM(total_taxable_subunits) AS turnover_subunits
       FROM ddt_documents
       WHERE deleted_at IS NULL 
         AND status <> 'bozza'
         AND doc_number IS NOT NULL
         AND CAST(strftime('%m', doc_date) AS INTEGER) = $1
       GROUP BY year, day
       ORDER BY year ASC, day ASC`,
      [month]
    );

    const dailyByYear: Record<number, DailyMetric[]> = {};
    const totalsByYear: Record<
      number,
      {
        totalTurnover: number;
        totalDdtCount: number;
        bestDay: { day: number; turnover: number };
        averageDailyTurnover: number;
      }
    > = {};

    for (const yr of availableYears) {
      dailyByYear[yr] = Array.from({ length: daysInMonth }, (_, idx) => ({
        day: idx + 1,
        turnover: 0,
        ddtCount: 0,
        cumulative: 0,
      }));
      totalsByYear[yr] = {
        totalTurnover: 0,
        totalDdtCount: 0,
        bestDay: { day: 1, turnover: 0 },
        averageDailyTurnover: 0,
      };
    }

    for (const r of dailyRows) {
      const yr = Number(r.year);
      const d = Number(r.day);
      if (dailyByYear[yr] && d >= 1 && d <= daysInMonth) {
        const turnover = (Number(r.turnover_subunits) || 0) / 100000;
        dailyByYear[yr][d - 1].turnover = turnover;
        dailyByYear[yr][d - 1].ddtCount = Number(r.ddt_count) || 0;
      }
    }

    // Calcolo cumulativi e statistiche totali per ciascun anno
    for (const yr of availableYears) {
      let runSum = 0;
      let totalDdt = 0;
      let bestDay = { day: 1, turnover: 0 };
      let activeDaysCount = 0;

      for (let i = 0; i < daysInMonth; i++) {
        const item = dailyByYear[yr][i];
        runSum += item.turnover;
        item.cumulative = runSum;
        totalDdt += item.ddtCount;
        if (item.turnover > bestDay.turnover) {
          bestDay = { day: item.day, turnover: item.turnover };
        }
        if (item.turnover > 0) activeDaysCount++;
      }

      totalsByYear[yr] = {
        totalTurnover: runSum,
        totalDdtCount: totalDdt,
        bestDay,
        averageDailyTurnover: activeDaysCount > 0 ? runSum / activeDaysCount : 0,
      };
    }

    const monthName = MONTH_NAMES[month - 1] || `Mese ${month}`;

    return {
      month,
      monthName,
      daysInMonth,
      availableYears,
      dailyByYear,
      totalsByYear,
    };
  }

  /**
   * Recupera l'elenco dei DDT emessi in uno specifico giorno e mese, con eventuale filtro per anno (o tutti gli anni)
   */
  public async getDdtsForDay(
    month: number,
    day: number,
    year?: number | null
  ): Promise<DdtListViewRow[]> {
    const db = await getDatabase();
    let sql = `
      SELECT 
        d.id, d.year, d.doc_number, d.series, d.doc_date, d.client_name,
        d.destination_name, d.destination_city, d.status, d.total_taxable_subunits,
        d.operator, d.transport_reason, d.order_reference, d.payment_method,
        COALESCE(SUM(CASE WHEN i.deleted_at IS NULL THEN
          i.purchase_price_subunits * CAST(COALESCE(NULLIF(REPLACE(i.quantity, ',', '.'), ''), '0') AS REAL) ELSE 0 END), 0) AS purchase_subunits,
        COALESCE(SUM(CASE WHEN i.deleted_at IS NULL THEN
          i.unit_price_subunits * CAST(COALESCE(NULLIF(REPLACE(i.quantity, ',', '.'), ''), '0') AS REAL) ELSE 0 END), 0) AS gross_subunits,
        COALESCE(SUM(CASE WHEN i.deleted_at IS NULL THEN i.net_amount_subunits ELSE 0 END), 0) AS net_rows_subunits
      FROM ddt_documents d
      LEFT JOIN ddt_items i ON i.ddt_id = d.id
      WHERE d.deleted_at IS NULL 
        AND d.status <> 'bozza' 
        AND d.doc_number IS NOT NULL
        AND CAST(strftime('%m', d.doc_date) AS INTEGER) = $1
        AND CAST(strftime('%d', d.doc_date) AS INTEGER) = $2
    `;
    const params: (number | string)[] = [month, day];
    if (year !== null && year !== undefined && year > 0) {
      params.push(year);
      sql += ` AND d.year = $${params.length}`;
    }

    sql += `
      GROUP BY d.id
      ORDER BY d.year DESC, d.doc_number DESC, d.doc_date DESC
    `;

    const rows = await db.select<{
      id: string;
      year: number;
      doc_number: number | null;
      series: string | null;
      doc_date: string;
      client_name: string;
      destination_name: string | null;
      destination_city: string | null;
      status: string;
      total_taxable_subunits: number;
      purchase_subunits: number | string;
      gross_subunits: number | string;
      net_rows_subunits: number | string;
      operator: string | null;
      transport_reason: string | null;
      order_reference: string | null;
      payment_method: string | null;
    }[]>(sql, params);

    return rows.map((row) => {
      const purchaseSubunits = Math.round(Number(row.purchase_subunits ?? 0));
      const gross = Number(row.gross_subunits ?? 0);
      const netRows = Number(row.net_rows_subunits ?? 0);
      const discount = gross > 0 ? Math.max(0, ((gross - netRows) / gross) * 100) : null;
      const revenueSubunits = Number(row.total_taxable_subunits ?? 0) - purchaseSubunits;
      return {
        id: row.id,
        year: Number(row.year),
        docNumber: row.doc_number,
        series: row.series || "",
        date: row.doc_date,
        client: row.client_name,
        destination: [row.destination_name, row.destination_city].filter(Boolean).join(" · "),
        status: row.status,
        taxableSubunits: Number(row.total_taxable_subunits ?? 0),
        purchaseSubunits,
        revenueSubunits,
        markupPercent: purchaseSubunits > 0 ? (revenueSubunits / purchaseSubunits) * 100 : null,
        discountPercent: discount,
        operator: row.operator || "",
        reason: row.transport_reason || "",
        orderReference: row.order_reference || "",
        payment: row.payment_method || "",
      };
    });
  }
}

export const dashboardService = new DashboardService();
