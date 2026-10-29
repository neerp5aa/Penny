import { afterEach, describe, expect, it, vi } from "vitest";

import { councilApi } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Council API approval boundary", () => {
  it("sends authentication and the exact proposal version on approval", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "applied", message: "Applied", dashboard: {} }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await councilApi.approveGoalChange("proposal-123", "version-abc");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/v1/council/proposals/proposal-123/approve");
    expect(request.method).toBe("POST");
    expect(request.headers).toMatchObject({
      Authorization: "Bearer penny-local-demo-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(request.body))).toEqual({
      approved: true,
      proposal_version: "version-abc",
    });
  });
});
