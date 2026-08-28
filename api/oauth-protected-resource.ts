import type { Request, Response } from "express";
import { getConfig } from "../src/config.js";

export default function oauthProtectedResource(_request: Request, response: Response): void {
  const config = getConfig();
  response.setHeader("Cache-Control", "public, max-age=300");
  response.status(200).json({
    resource: config.mcpServerUrl.toString(),
    authorization_servers: [config.supabaseAuthorizationServer],
    scopes_supported: ["openid", "email", "profile"],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://github.com/jaywapp/gyungchung-mcp",
  });
}
