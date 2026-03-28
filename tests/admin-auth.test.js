/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getContractFixture } from "./helpers/contracts.js";
import { mountAdminDom, stubAdminGlobals } from "./helpers/admin-fixture.js";

describe("admin auth contract flows", () => {
  beforeEach(() => {
    vi.resetModules();
    mountAdminDom();
    stubAdminGlobals(vi);
    localStorage.clear();
  });

  it("accepts admin sessions and opens the dashboard", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => getContractFixture("session").admin,
    })));

    const { checkSession } = await import("../admin/auth.js");
    const showDashboard = vi.fn(async () => {});

    const allowed = await checkSession(showDashboard);

    expect(allowed).toBe(true);
    expect(showDashboard).toHaveBeenCalledTimes(1);
    expect(document.getElementById("loginError").textContent).toBe("");
  });

  it("rejects non-admin logins with the current session contract", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => getContractFixture("session").user,
    })));

    const { login } = await import("../admin/auth.js");
    const showDashboard = vi.fn(async () => {});

    const allowed = await login("reader@example.com", "password123", showDashboard);

    expect(allowed).toBe(false);
    expect(showDashboard).not.toHaveBeenCalled();
    expect(document.getElementById("loginError").textContent).toContain("isn't an admin");
  });

  it("clears the form and restores the login shell on logout", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));

    const { logout } = await import("../admin/auth.js");
    document.getElementById("loginEmail").value = "admin@example.com";
    document.getElementById("loginPassword").value = "password123";
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("adminDashboard").style.display = "block";

    await logout();

    expect(document.getElementById("loginEmail").value).toBe("");
    expect(document.getElementById("loginPassword").value).toBe("");
    expect(document.getElementById("loginScreen").style.display).toBe("flex");
    expect(document.getElementById("adminDashboard").style.display).toBe("none");
  });
});
