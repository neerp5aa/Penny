import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, resolveAccessToken } from "./api";

const sessionToken = vi.hoisted(() => vi.fn<() => Promise<string | null>>());
vi.mock("./supabase", () => ({ getSupabaseAccessToken: sessionToken }));

beforeEach(() => {
  sessionToken.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("bearer-token selection", () => {
  it("prefers the Supabase session token over the demo token", async () => {
    const token = await resolveAccessToken({ sessionToken: async () => "supabase-jwt", demoMode: true, demoToken: "demo" });
    expect(token).toBe("supabase-jwt");
  });

  it("uses the demo token only when demo mode is explicitly enabled", async () => {
    const token = await resolveAccessToken({ sessionToken: async () => null, demoMode: true, demoToken: "demo" });
    expect(token).toBe("demo");
  });

  it("never invents a token when demo mode is disabled", async () => {
    const attempt = resolveAccessToken({ sessionToken: async () => null, demoMode: false, demoToken: "demo" });
    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await expect(attempt).rejects.toMatchObject({ status: 401, needsSignIn: true });
  });

  it("requires a demo token value even in demo mode", async () => {
    await expect(resolveAccessToken({ sessionToken: async () => null, demoMode: true, demoToken: undefined })).rejects.toMatchObject({ status: 401 });
  });

  it("does not call the API without a token", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    sessionToken.mockResolvedValue(null);
    const { dashboardApi } = await import("./api");

    await expect(dashboardApi.load()).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("authenticated API requests", () => {
  it("sends the session token on dashboard reads and surfaces API status", async () => {
    sessionToken.mockResolvedValue("supabase-jwt");
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ detail: "Financial context is not available" }) });
    vi.stubGlobal("fetch", fetchMock);
    const { dashboardApi } = await import("./api");

    await expect(dashboardApi.load()).rejects.toMatchObject({ status: 403, message: "Financial context is not available" });
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.headers).toMatchObject({ Authorization: "Bearer supabase-jwt" });
  });
});

describe("Council API approval boundary", () => {
  it("sends authentication and the exact proposal version on approval", async () => {
    sessionToken.mockResolvedValue("supabase-jwt");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "applied", message: "Applied", dashboard: {} }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { councilApi } = await import("./api");

    await councilApi.approveGoalChange("proposal-123", "version-abc");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/v1/council/proposals/proposal-123/approve");
    expect(request.method).toBe("POST");
    expect(request.headers).toMatchObject({
      Authorization: "Bearer supabase-jwt",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(request.body))).toEqual({
      approved: true,
      proposal_version: "version-abc",
    });
  });
});
