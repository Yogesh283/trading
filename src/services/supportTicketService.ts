import crypto from "node:crypto";
import { dbAll, dbRun } from "../db/appDb";

export type SupportTicketRow = {
  id: string;
  user_id: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
};

function newTicketId(): string {
  return `TKT-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function createSupportTicket(
  userId: string,
  subject: string,
  body: string
): Promise<{ id: string; subject: string; body: string; status: string; createdAt: string }> {
  const id = newTicketId();
  const created = nowIso();
  await dbRun(
    `INSERT INTO support_tickets (id, user_id, subject, body, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)`,
    [id, userId, subject, body, created]
  );
  return { id, subject, body, status: "open", createdAt: created };
}

export async function listSupportTicketsForUser(userId: string): Promise<
  Array<{ id: string; subject: string; body: string; status: string; createdAt: string }>
> {
  const rows = await dbAll<SupportTicketRow>(
    `SELECT id, user_id, subject, body, status, created_at FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
    [userId]
  );
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    body: r.body,
    status: r.status,
    createdAt: r.created_at
  }));
}
