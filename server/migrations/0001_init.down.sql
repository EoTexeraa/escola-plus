-- 0001_init (down) — remove todas as tabelas (ordem inversa das dependências)
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS study_routine_checks;
DROP TABLE IF EXISTS study_routines;
DROP TABLE IF EXISTS calendar_events;
DROP TABLE IF EXISTS homework_completions;
DROP TABLE IF EXISTS homework;
DROP TABLE IF EXISTS announcement_reads;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS grades;
DROP TABLE IF EXISTS teaching_assignments;
DROP TABLE IF EXISTS access_keys;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS school_classes;
