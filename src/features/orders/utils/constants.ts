export const TODAY = (): string =>
  new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

export interface FornitoreColor {
  bg: string;
  text: string;
  border: string;
}

export const FORNITORE_COLORS: FornitoreColor[] = [
  { bg: 'rgba(59,130,246,0.18)', text: '#93c5fd', border: '#3b82f6' }, // Blue 500
  { bg: 'rgba(16,185,129,0.18)', text: '#6ee7b7', border: '#10b981' }, // Emerald 500
  { bg: 'rgba(139,92,246,0.18)', text: '#c4b5fd', border: '#8b5cf6' }, // Violet 500
  { bg: 'rgba(245,158,11,0.18)', text: '#fcd34d', border: '#f59e0b' }, // Amber 500
  { bg: 'rgba(236,72,153,0.18)', text: '#f9a8d4', border: '#ec4899' }, // Pink 500
  { bg: 'rgba(14,165,233,0.18)', text: '#7dd3fc', border: '#0ea5e9' }, // Sky 500
  { bg: 'rgba(249,115,22,0.18)', text: '#fdba74', border: '#f97316' }, // Orange 500
  { bg: 'rgba(20,184,166,0.18)', text: '#5eead4', border: '#14b8a6' }, // Teal 500
  { bg: 'rgba(239,68,68,0.18)', text: '#fca5a5', border: '#ef4444' }, // Red 500
  { bg: 'rgba(168,85,247,0.18)', text: '#d8b4fe', border: '#a855f7' }, // Purple 500
  { bg: 'rgba(99,102,241,0.18)', text: '#a5b4fc', border: '#6366f1' }, // Indigo 500
  { bg: 'rgba(132,204,22,0.18)', text: '#bef264', border: '#84cc16' }, // Lime 500
  { bg: 'rgba(234,179,8,0.18)', text: '#fde047', border: '#eab308' }, // Yellow 500
  { bg: 'rgba(244,63,94,0.18)', text: '#fda4af', border: '#f43f5e' }, // Rose 500
  { bg: 'rgba(6,182,212,0.18)', text: '#67e8f9', border: '#06b6d4' }, // Cyan 500
  { bg: 'rgba(34,197,94,0.18)', text: '#86efac', border: '#22c55e' }, // Green 500
  { bg: 'rgba(217,70,239,0.18)', text: '#f0abfc', border: '#d946ef' }, // Fuchsia 500
  { bg: 'rgba(113,113,122,0.22)', text: '#d4d4d8', border: '#71717a' }, // Zinc 500
  { bg: 'rgba(251,146,60,0.18)', text: '#fdba74', border: '#fb923c' }, // Orange 400
  { bg: 'rgba(129,140,248,0.18)', text: '#c7d2fe', border: '#818cf8' }, // Indigo 400
  { bg: 'rgba(56,189,248,0.18)', text: '#7dd3fc', border: '#38bdf8' }, // Sky 400
  { bg: 'rgba(52,211,153,0.18)', text: '#6ee7b7', border: '#34d399' }, // Emerald 400
  { bg: 'rgba(167,139,250,0.18)', text: '#c4b5fd', border: '#a78bfa' }, // Violet 400
  { bg: 'rgba(250,204,21,0.18)', text: '#fef08a', border: '#facc15' }, // Yellow 400
  { bg: 'rgba(244,114,182,0.18)', text: '#fbcfe8', border: '#f472b6' }, // Pink 400
  { bg: 'rgba(45,212,191,0.18)', text: '#5eead4', border: '#2dd4bf' }, // Teal 400
  { bg: 'rgba(248,113,113,0.18)', text: '#fca5a5', border: '#f87171' }, // Red 400
  { bg: 'rgba(192,132,252,0.18)', text: '#d8b4fe', border: '#c084fc' }, // Purple 400
  { bg: 'rgba(163,230,53,0.18)', text: '#d9f99d', border: '#a3e635' }, // Lime 400
  { bg: 'rgba(96,165,250,0.18)', text: '#93c5fd', border: '#60a5fa' }, // Blue 400
];

export const getFornitoreColor = (name?: string | null): FornitoreColor | null => {
  if (!name || name.trim() === '') return null;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return FORNITORE_COLORS[Math.abs(hash) % FORNITORE_COLORS.length];
};

export const ORDER_GRID_CSS = `
  .orders-modern-grid {
    --ag-font-size: 11px;
    --ag-row-height: 25px;
    --ag-header-height: 30px;
    --ag-background-color: var(--card) !important;
    --ag-foreground-color: var(--foreground) !important;
    --ag-header-background-color: var(--background) !important;
    --ag-header-foreground-color: var(--muted-foreground) !important;
    --ag-border-color: var(--border) !important;
    --ag-row-border-color: var(--border) !important;
    --ag-selected-row-background-color: rgba(59, 130, 246, 0.15) !important;
  }
  .orders-modern-grid .ag-root-wrapper { 
    border: 1px solid var(--border) !important; 
    background-color: var(--card) !important; 
    border-radius: 8px !important;
    overflow: hidden !important;
  }
  .orders-modern-grid .ag-cell { 
    font-size: 11px !important; 
    display: flex !important;
    align-items: center !important; 
    padding: 0 8px !important;
    border-right: 1px solid var(--border) !important;
    color: var(--foreground) !important;
  }
  .orders-modern-grid .ag-cell.ag-cell-inline-editing {
    padding: 0 !important;
    display: block !important;
  }
  .orders-modern-grid .ag-cell.ag-cell-inline-editing .ag-cell-wrapper,
  .orders-modern-grid .ag-cell.ag-cell-inline-editing input,
  .orders-modern-grid input.ag-cell-edit-input {
    height: 100% !important;
    width: 100% !important;
    background-color: #1e293b !important;
    color: #f8fafc !important;
    border: 2px solid #3b82f6 !important;
    padding: 0 8px !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    outline: none !important;
    box-sizing: border-box !important;
  }
  .orders-modern-grid .ag-header { 
    background-color: var(--background) !important; 
    color: var(--muted-foreground) !important;
    text-transform: uppercase; 
    font-size: 0.68rem; 
    letter-spacing: 0.06em; 
    font-weight: 700;
    border-bottom: 2px solid var(--border) !important; 
  }
  .orders-modern-grid .ag-header-cell {
    border-right: 1px solid var(--border) !important;
  }
  .orders-modern-grid .ag-header-cell-label { 
    color: var(--muted-foreground) !important; 
    font-weight: 700 !important;
  }
  .orders-modern-grid .ag-row { 
    background-color: var(--card) !important; 
    color: var(--foreground) !important; 
    border-bottom: 1px solid var(--border) !important; 
    transition: background 0.1s ease-in-out; 
  }
  .orders-modern-grid .ag-row:hover { 
    background-color: rgba(255, 255, 255, 0.03) !important; 
  }
  .orders-modern-grid .ag-cell-focus { 
    outline: 2px solid #3b82f6 !important; 
    outline-offset: -2px !important;
  }
  .orders-modern-grid .ag-row-new-entry { 
    background-color: rgba(16, 185, 129, 0.04) !important; 
    font-style: italic; 
  }
  .orders-modern-grid .centered-cell { 
    align-items: center !important; 
    justify-content: center !important; 
  }
`;

