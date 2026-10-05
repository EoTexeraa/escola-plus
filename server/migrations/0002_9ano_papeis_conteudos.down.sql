-- 0002 (down) — volta ao esquema 0001. ATENÇÃO: o Administrador vira 'admin' antigo junto com a Coordenação;
-- conteúdos, calendário de provas e níveis de inglês são descartados.
-- @foreign_keys_off
DROP TABLE IF EXISTS study_contents;
DROP TABLE IF EXISTS exam_schedules;
DROP INDEX IF EXISTS idx_calendar_auto;
ALTER TABLE calendar_events DROP COLUMN source;
ALTER TABLE calendar_events DROP COLUMN exam_number;
ALTER TABLE calendar_events DROP COLUMN bimester;
ALTER TABLE subjects DROP COLUMN exam_weekday;
ALTER TABLE subjects DROP COLUMN exam_group;
ALTER TABLE subjects DROP COLUMN english_level;

CREATE TABLE access_keys_old (
    id INTEGER PRIMARY KEY,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    key_hint VARCHAR(12) NOT NULL,
    role VARCHAR(10) NOT NULL CHECK (role IN ('teacher', 'admin')),
    max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
    use_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP,
    revoked_at TIMESTAMP,
    label VARCHAR(80),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO access_keys_old SELECT id, key_hash, key_hint, CASE role WHEN 'coordinator' THEN 'admin' ELSE role END,
    max_uses, use_count, expires_at, revoked_at, label, created_by, created_at FROM access_keys;
DROP TABLE access_keys;
ALTER TABLE access_keys_old RENAME TO access_keys;

CREATE TABLE users_old (
    id INTEGER PRIMARY KEY,
    username VARCHAR(30) NOT NULL UNIQUE,
    password_hash VARCHAR(200) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(10) NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
    class_id INTEGER REFERENCES school_classes(id) ON DELETE SET NULL,
    security_question VARCHAR(120) NOT NULL,
    security_answer_hash VARCHAR(200) NOT NULL,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    failed_reset_count INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMP,
    must_change_password BOOLEAN NOT NULL DEFAULT false,
    token_version INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (role = 'student' OR class_id IS NULL)
);
INSERT INTO users_old SELECT id, username, password_hash, full_name,
    CASE WHEN role IN ('coordinator', 'admin') THEN 'admin' ELSE role END, class_id, security_question,
    security_answer_hash, failed_login_count, failed_reset_count, locked_until, must_change_password, token_version,
    is_active, created_at, updated_at FROM users;
DROP TABLE users;
ALTER TABLE users_old RENAME TO users;
CREATE INDEX idx_users_class_role_name ON users (class_id, role, full_name);
DELETE FROM schema_migrations WHERE version = '0002_9ano_papeis_conteudos';
