// Espelho tipado de migrations/0001_init.up.sql (fonte da verdade: docs/database/schema.sql).
import { sql } from 'drizzle-orm';
import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const createdAt = () => text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`);

export const schoolClasses = sqliteTable('school_classes', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  schoolYear: integer('school_year').notNull(),
  createdAt: createdAt(),
});

export const subjects = sqliteTable('subjects', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
  colorHex: text('color_hex').notNull().default('#4F46E5'),
  englishLevel: integer('english_level'),   // 2, 3 ou 4 (só nas turmas de Inglês)
  examGroup: integer('exam_group'),         // 1 ou 2
  examWeekday: integer('exam_weekday'),     // 2 = terça, 4 = quinta, 5 = sexta
  createdAt: createdAt(),
});

// 'coordinator' = Coordenação; 'admin' = Administrador (único, acima da coordenação)
export const ROLES = ['student', 'teacher', 'coordinator', 'admin'] as const;
export const ENGLISH_LEVELS = [2, 3, 4] as const;
export type Role = (typeof ROLES)[number];

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  role: text('role', { enum: ROLES }).notNull(),
  classId: integer('class_id').references(() => schoolClasses.id, { onDelete: 'set null' }),
  englishLevel: integer('english_level'),
  securityQuestion: text('security_question').notNull(),
  securityAnswerHash: text('security_answer_hash').notNull(),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  failedResetCount: integer('failed_reset_count').notNull().default(0),
  lockedUntil: text('locked_until'),
  mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(false),
  tokenVersion: integer('token_version').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const accessKeys = sqliteTable('access_keys', {
  id: integer('id').primaryKey(),
  keyHash: text('key_hash').notNull().unique(),
  keyHint: text('key_hint').notNull(),
  role: text('role', { enum: ['teacher', 'coordinator'] }).notNull(),
  maxUses: integer('max_uses').notNull().default(1),
  useCount: integer('use_count').notNull().default(0),
  expiresAt: text('expires_at'),
  revokedAt: text('revoked_at'),
  label: text('label'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const teachingAssignments = sqliteTable('teaching_assignments', {
  id: integer('id').primaryKey(),
  teacherId: integer('teacher_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  classId: integer('class_id').notNull().references(() => schoolClasses.id, { onDelete: 'cascade' }),
  subjectId: integer('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
});

export const GRADE_COMPONENTS = ['exam1', 'exam2', 'exam3', 'exam4', 'project', 'homework', 'mock'] as const;
export type GradeComponent = (typeof GRADE_COMPONENTS)[number];

export const grades = sqliteTable('grades', {
  id: integer('id').primaryKey(),
  studentId: integer('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  classId: integer('class_id').notNull().references(() => schoolClasses.id, { onDelete: 'cascade' }),
  subjectId: integer('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  bimester: integer('bimester').notNull(),
  component: text('component', { enum: GRADE_COMPONENTS }).notNull(),
  score: real('score').notNull(),
  gradedBy: integer('graded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ANNOUNCEMENT_CATEGORIES = ['general', 'exam', 'event', 'urgent'] as const;

export const announcements = sqliteTable('announcements', {
  id: integer('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  category: text('category', { enum: ANNOUNCEMENT_CATEGORIES }).notNull().default('general'),
  classId: integer('class_id').references(() => schoolClasses.id, { onDelete: 'cascade' }),
  isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
  authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const announcementReads = sqliteTable(
  'announcement_reads',
  {
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    announcementId: integer('announcement_id').notNull().references(() => announcements.id, { onDelete: 'cascade' }),
    readAt: text('read_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.announcementId] })],
);

export const homework = sqliteTable('homework', {
  id: integer('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  classId: integer('class_id').notNull().references(() => schoolClasses.id, { onDelete: 'cascade' }),
  subjectId: integer('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  dueDate: text('due_date').notNull(),
  authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const homeworkCompletions = sqliteTable(
  'homework_completions',
  {
    studentId: integer('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    homeworkId: integer('homework_id').notNull().references(() => homework.id, { onDelete: 'cascade' }),
    completedAt: text('completed_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.homeworkId] })],
);

export const EVENT_TYPES = ['exam', 'holiday', 'event', 'meeting', 'deadline'] as const;

export const calendarEvents = sqliteTable('calendar_events', {
  id: integer('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  eventType: text('event_type', { enum: EVENT_TYPES }).notNull().default('event'),
  startsOn: text('starts_on').notNull(),
  endsOn: text('ends_on'),
  classId: integer('class_id').references(() => schoolClasses.id, { onDelete: 'cascade' }),
  subjectId: integer('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
  authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
  bimester: integer('bimester'),
  examNumber: integer('exam_number'),
  source: text('source', { enum: ['manual', 'auto'] }).notNull().default('manual'),
  createdAt: createdAt(),
});

export const examSchedules = sqliteTable('exam_schedules', {
  id: integer('id').primaryKey(),
  schoolYear: integer('school_year').notNull(),
  bimester: integer('bimester').notNull(),
  firstTuesday: text('first_tuesday').notNull(),
  startingGroup: integer('starting_group').notNull().default(1),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const studyContents = sqliteTable('study_contents', {
  id: integer('id').primaryKey(),
  subjectId: integer('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  bimester: integer('bimester').notNull(),
  examNumber: integer('exam_number'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const studyRoutines = sqliteTable('study_routines', {
  id: integer('id').primaryKey(),
  studentId: integer('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  weekday: integer('weekday').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  subjectId: integer('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
  activity: text('activity').notNull(),
  createdAt: createdAt(),
});

export const studyRoutineChecks = sqliteTable(
  'study_routine_checks',
  {
    routineId: integer('routine_id').notNull().references(() => studyRoutines.id, { onDelete: 'cascade' }),
    doneOn: text('done_on').notNull(),
  },
  (t) => [primaryKey({ columns: [t.routineId, t.doneOn] })],
);

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey(),
  actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: integer('entity_id'),
  details: text('details'),
  createdAt: createdAt(),
});
