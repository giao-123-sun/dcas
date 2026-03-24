import express from "express";
import { router } from "./routes.js";

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") { res.sendStatus(200); return; }
  next();
});
app.use("/api", router);
app.get("/health", (_req, res) => { res.json({ status: "ok", version: "0.1.0" }); });

const PORT = process.env.PORT ?? 8000;
if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  app.listen(PORT, () => console.log(`DCAS API on http://localhost:${PORT}`));
}
export { app };
