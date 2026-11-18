import { describe, expect, it, vi } from "vitest";
import { registerEscHandler, triggerTopEscHandler } from "../useEscClose";

describe("useEscClose LIFO stack", () => {
  it("closes only the topmost registered modal on each Escape press", () => {
    const events: string[] = [];
    const baseDispose = registerEscHandler(() => events.push("base"));
    const topDispose = registerEscHandler(() => events.push("top"));

    expect(triggerTopEscHandler()).toBe(true);
    expect(events).toEqual(["top"]);

    // Il modal di base rimane ancora aperto fino al successivo ESC
    expect(triggerTopEscHandler()).toBe(true);
    expect(events).toEqual(["top", "base"]);

    expect(triggerTopEscHandler()).toBe(false);
    baseDispose();
    topDispose();
  });

  it("removes a handler cleanly if unmounted before Escape", () => {
    const baseFn = vi.fn();
    const childFn = vi.fn();
    const unsubBase = registerEscHandler(baseFn);
    const unsubChild = registerEscHandler(childFn);

    unsubChild();
    expect(triggerTopEscHandler()).toBe(true);
    expect(childFn).not.toHaveBeenCalled();
    expect(baseFn).toHaveBeenCalledTimes(1);
    unsubBase();
  });
});
