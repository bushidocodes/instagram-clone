import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { shouldShowEnableNotifications, updateNotificationButtonVisibility } from "./app.js";

describe("shouldShowEnableNotifications", () => {
  it("is false when the Notification API is missing", () => {
    expect(shouldShowEnableNotifications(undefined)).toBe(false);
  });

  it("is true when permission is default or denied", () => {
    expect(shouldShowEnableNotifications({ permission: "default" })).toBe(true);
    expect(shouldShowEnableNotifications({ permission: "denied" })).toBe(true);
  });

  it("is false once permission has been granted", () => {
    expect(shouldShowEnableNotifications({ permission: "granted" })).toBe(false);
  });
});

describe("updateNotificationButtonVisibility", () => {
  it("shows buttons when the API is supported and permission is not granted", () => {
    const btn = document.createElement("button");
    btn.style.display = "none";
    updateNotificationButtonVisibility([btn], { permission: "denied" });
    expect(btn.style.display).toBe("inline-block");
  });

  it("hides buttons after permission is granted", () => {
    const btn = document.createElement("button");
    btn.style.display = "inline-block";
    updateNotificationButtonVisibility([btn], { permission: "granted" });
    expect(btn.style.display).toBe("none");
  });
});
