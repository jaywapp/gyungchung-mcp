import type { Request, Response } from "express";

export default function health(_request: Request, response: Response): void {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({ status: "ok", service: "gyungchung-admin-mcp" });
}
