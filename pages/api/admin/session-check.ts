import type { NextApiRequest, NextApiResponse } from "next";
import {
  getAdminSessionErrorMessage,
  getAdminSessionErrorStatus,
  requireAdminSession,
} from "../../../lib/server/admin-session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAdminSession(req, res);
    return res.status(200).json({ authenticated: true, authorized: true });
  } catch (error) {
    const status = getAdminSessionErrorStatus(error);
    return res.status(status).json({
      authenticated: status !== 401,
      authorized: false,
      error: getAdminSessionErrorMessage(error),
    });
  }
}
