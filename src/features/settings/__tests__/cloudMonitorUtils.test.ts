import { describe, it, expect } from "vitest";
import {
  computeTableComparison,
  computeTokenExpiryInfo,
  formatBytes,
} from "../cloudMonitorUtils";

describe("cloudMonitorUtils", () => {
  it("computes aligned ratio and zero delta when local and cloud counts match", () => {
    const row = computeTableComparison({
      key: "ddt",
      label: "DDT Confermati",
      cloudTable: "ddt",
      localTable: "ddt_documents",
      cloudCount: 11348,
      localCount: 11348,
      pendingCount: 0,
      cloudSizeBytes: 12_500_000,
    });

    expect(row.status).toBe("aligned");
    expect(row.delta).toBe(0);
    expect(row.ratioPercent).toBe(100);
    expect(row.ratioLabel).toBe("100.0%");
  });

  it("computes mismatch delta and ratio when local and cloud differ", () => {
    const row = computeTableComparison({
      key: "clienti",
      label: "Clienti",
      cloudTable: "clienti",
      localTable: "clients",
      cloudCount: 161,
      localCount: 189,
      pendingCount: 28,
    });

    expect(row.status).toBe("mismatch");
    expect(row.delta).toBe(28);
    expect(row.ratioPercent).toBe(117.4);
    expect(row.ratioLabel).toBe("117.4%");
  });

  it("handles zero cloud rows and errors gracefully", () => {
    const bothZero = computeTableComparison({
      key: "empty",
      label: "Empty",
      cloudTable: "a",
      localTable: "b",
      cloudCount: 0,
      localCount: 0,
    });
    expect(bothZero.status).toBe("aligned");
    expect(bothZero.ratioLabel).toBe("100.0% (0 / 0)");

    const cloudZeroLocalPositive = computeTableComparison({
      key: "only_local",
      label: "Only local",
      cloudTable: "a",
      localTable: "b",
      cloudCount: 0,
      localCount: 5,
    });
    expect(cloudZeroLocalPositive.status).toBe("mismatch");
    expect(cloudZeroLocalPositive.ratioLabel).toBe("5 / 0");

    const errRow = computeTableComparison({
      key: "err",
      label: "Err",
      cloudTable: "a",
      localTable: "b",
      cloudCount: null,
      localCount: 10,
      cloudError: "HTTP 401",
    });
    expect(errRow.status).toBe("error");
    expect(errRow.delta).toBeNull();
  });

  it("classifies token expiry into valid, 20-day warning, and expired", () => {
    const now = new Date(2026, 10, 17); // 2026-11-17

    expect(computeTokenExpiryInfo("", now).status).toBe("none");
    expect(computeTokenExpiryInfo("2027-09-01", now)).toMatchObject({
      status: "valid",
      daysRemaining: 288,
    });
    expect(computeTokenExpiryInfo("2026-12-01", now)).toMatchObject({
      status: "warning",
      daysRemaining: 14,
    });
    expect(computeTokenExpiryInfo("2026-11-15", now)).toMatchObject({
      status: "expired",
      daysRemaining: -2,
    });
  });

  it("formats bytes cleanly across B, KB, MB, GB", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(28 * 1024 * 1024)).toBe("28.0 MB");
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.00 GB");
  });
});
