import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerWindowCloseGuard,
  registerDirtyCheck,
  hasAnyUnsavedChanges,
  runAllWindowCloseGuards,
  requestWindowClose,
  useWindowStore,
} from "../useWindowStore";

describe("windowCloseGuards and dirty checks", () => {
  beforeEach(() => {
    useWindowStore.setState({
      windows: [
        {
          id: "win-1",
          title: "Test 1",
          componentId: "ddt-studio",
          x: 0,
          y: 0,
          width: 500,
          height: 400,
          zIndex: 1,
          isMinimized: false,
          isMaximized: false,
          closable: true,
        },
      ],
      activeWindowId: "win-1",
    });
  });

  it("reports hasAnyUnsavedChanges correctly", () => {
    let dirty = false;
    expect(hasAnyUnsavedChanges()).toBe(false);

    const unregister = registerDirtyCheck("win-1", () => dirty);
    expect(hasAnyUnsavedChanges()).toBe(false);

    dirty = true;
    expect(hasAnyUnsavedChanges()).toBe(true);

    unregister();
    expect(hasAnyUnsavedChanges()).toBe(false);
  });

  it("prevents requestWindowClose if guard rejects, and closes if guard approves", async () => {
    let canClose = false;
    const unregister = registerWindowCloseGuard("win-1", async () => canClose);

    await requestWindowClose("win-1");
    expect(useWindowStore.getState().windows.some((w) => w.id === "win-1")).toBe(true);

    canClose = true;
    await requestWindowClose("win-1");
    expect(useWindowStore.getState().windows.some((w) => w.id === "win-1")).toBe(false);

    unregister();
  });

  it("runAllWindowCloseGuards iterates guards and cancels on rejection", async () => {
    const guard1 = vi.fn().mockResolvedValue(true);
    const guard2 = vi.fn().mockResolvedValue(false);

    const unreg1 = registerWindowCloseGuard("win-1", guard1);
    const unreg2 = registerWindowCloseGuard("win-2", guard2);

    const result = await runAllWindowCloseGuards();
    expect(result).toBe(false);
    expect(guard1).toHaveBeenCalled();
    expect(guard2).toHaveBeenCalled();

    unreg1();
    unreg2();
  });
});
