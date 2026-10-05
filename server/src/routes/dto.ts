import type { users } from '../db/schema.js';

/** DTO explícito: hashes e contadores nunca saem do servidor (modelo de ameaças: exposição de dados). */
export function toUserDto(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    classId: u.classId,
    englishLevel: u.englishLevel,
    mustChangePassword: u.mustChangePassword,
  };
}
