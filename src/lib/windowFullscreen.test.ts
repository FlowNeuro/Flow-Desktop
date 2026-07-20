import { describe, expect, it, vi } from "vitest";
import { createWindowFullscreenController } from "./windowFullscreen";

describe("createWindowFullscreenController", () => {
  it("sends native enter and exit transitions in order", async () => {
    const setNativeFullscreen = vi.fn(async () => {});
    const controller = createWindowFullscreenController(setNativeFullscreen);

    await controller.sync(true);
    await controller.sync(false);

    expect(setNativeFullscreen).toHaveBeenCalledTimes(2);
    expect(setNativeFullscreen).toHaveBeenNthCalledWith(1, true);
    expect(setNativeFullscreen).toHaveBeenNthCalledWith(2, false);
  });

  it("does not dispatch a stale enter after fullscreen has already been exited", async () => {
    const setNativeFullscreen = vi.fn(async () => {});
    const controller = createWindowFullscreenController(setNativeFullscreen);

    const enter = controller.sync(true);
    const exit = controller.sync(false);
    await Promise.all([enter, exit]);

    expect(setNativeFullscreen).not.toHaveBeenCalled();
  });

  it("skips duplicate native commands", async () => {
    const setNativeFullscreen = vi.fn(async () => {});
    const controller = createWindowFullscreenController(setNativeFullscreen);

    await controller.sync(true);
    await controller.sync(true);

    expect(setNativeFullscreen).toHaveBeenCalledTimes(1);
  });
});
