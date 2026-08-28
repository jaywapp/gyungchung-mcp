import { createMcpExpressApp, requireBearerAuth } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { SupabaseOAuthTokenVerifier } from "../src/auth/verifier.js";
import { getConfig } from "../src/config.js";
import { buildAdminMcpServer } from "../src/mcp/server.js";

const config = getConfig();
const allowedHosts = new Set([config.mcpServerUrl.hostname, "localhost", "127.0.0.1"]);
if (process.env.VERCEL_URL) allowedHosts.add(process.env.VERCEL_URL);

const app = createMcpExpressApp({ host: "0.0.0.0", allowedHosts: [...allowedHosts] });
const auth = requireBearerAuth({
  verifier: new SupabaseOAuthTokenVerifier(),
  resourceMetadataUrl: config.resourceMetadataUrl.toString(),
});
const nodeHandler = toNodeHandler(createMcpHandler(({ authInfo }) => buildAdminMcpServer(authInfo)));

app.use(auth, (request, response) => {
  response.setHeader("Cache-Control", "private, no-store");
  void nodeHandler(request, response, request.body);
});

export default app;
