-- 0003 (up) — índice para achar a data da prova de um conteúdo (matéria + bimestre + número da prova)
CREATE INDEX idx_calendar_subject_exam ON calendar_events (subject_id, bimester, exam_number);
