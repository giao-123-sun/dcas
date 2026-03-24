import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { app } from "../src/server.js";
import type { Server } from "http";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 3999;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => { server.close(() => resolve()); });
});

describe("DCAS API", () => {
  it("GET /health", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect((await res.json()).status).toBe("ok");
  });

  it("POST /api/simulate returns rankings", async () => {
    const res = await fetch(`${baseUrl}/api/simulate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimAmount: 80000, evidenceStrength: 7, mcRuns: 5 }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rankings).toHaveLength(3);
    expect(data.rankings[0].rank).toBe(1);
    expect(data.decisionId).toBeDefined();
  });

  it("POST /api/feedback records outcome", async () => {
    const sim = await (await fetch(`${baseUrl}/api/simulate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimAmount: 80000, mcRuns: 3 }),
    })).json();
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisionId: sim.decisionId, actualKPIValues: { recovery: 60000 }, deviations: { recovery: -0.08 } }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("recorded");
  });

  it("POST /api/feedback 400 on missing fields", async () => {
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("GET /api/history", async () => {
    const res = await fetch(`${baseUrl}/api/history?limit=5`);
    const data = await res.json();
    expect(data.total).toBeGreaterThan(0);
  });

  it("GET /api/patterns", async () => {
    const res = await fetch(`${baseUrl}/api/patterns`);
    expect(res.status).toBe(200);
  });
});
