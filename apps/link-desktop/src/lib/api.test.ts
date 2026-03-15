import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import { DaemonApiClient, DaemonApiError } from "./api";

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(),
}));

describe("DaemonApiClient", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("unwraps v1 envelopes", async () => {
    vi.mocked(tauriFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ api_version: "v1", body: { ok: true } }),
    } as unknown as Response);

    const client = new DaemonApiClient("http://127.0.0.1:9999");
    await expect(client.health()).resolves.toEqual({ ok: true });
  });

  it("surfaces daemon API errors", async () => {
    vi.mocked(tauriFetch).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        api_version: "v1",
        error: { code: "denied", message: "service denied" },
      }),
    } as unknown as Response);

    const client = new DaemonApiClient("http://127.0.0.1:9999");
    await expect(client.health()).rejects.toBeInstanceOf(DaemonApiError);
  });
});
