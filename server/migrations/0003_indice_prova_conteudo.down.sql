-- 0003 (down)
DROP INDEX IF EXISTS idx_calendar_subject_exam;
DELETE FROM schema_migrations WHERE version = '0003_indice_prova_conteudo';
