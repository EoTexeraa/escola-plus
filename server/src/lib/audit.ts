import type { Db } from '../db/client.js';
import { auditLog } from '../db/schema.js';

export type AuditAction =
  | 'login.success' | 'login.failure' | 'login.locked'
  | 'password.reset.success' | 'password.reset.failure' | 'password.change' | 'password.admin_reset'
  | 'user.register' | 'user.update' | 'user.delete' | 'data.reset'
  | 'access_key.create' | 'access_key.revoke' | 'access_key.use'
  | 'grade.upsert' | 'grade.delete'
  | 'assignment.create' | 'assignment.delete';

/** Trilha de auditoria somente-inserção (modelo de ameaças: repúdio). */
export async function audit(
  db: Db,
  actorId: number | null,
  action: AuditAction,
  entity: string,
  entityId: number | null = null,
  details?: Record<string, unknown>,
) {
  await db.insert(auditLog).values({
    actorId,
    action,
    entity,
    entityId,
    details: details ? JSON.stringify(details) : null,
  });
}
