-- 0002 (up) — 9º ano, papéis Coordenação/Administrador, inglês por nível, grupos de prova, conteúdos.
-- @foreign_keys_off  (reconstrói users e access_keys: procedimento de 12 passos do SQLite)

-- 1) users: papel antigo 'admin' vira 'coordinator'; novo 'admin' = Administrador (único); nível de inglês
CREATE TABLE users_new (
    id INTEGER PRIMARY KEY,
    username VARCHAR(30) NOT NULL UNIQUE,
    password_hash VARCHAR(200) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(12) NOT NULL CHECK (role IN ('student', 'teacher', 'coordinator', 'admin')),
    class_id INTEGER REFERENCES school_classes(id) ON DELETE SET NULL,
    english_level INTEGER CHECK (english_level IN (2, 3, 4)),
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
    CHECK (role = 'student' OR (class_id IS NULL AND english_level IS NULL))
);
INSERT INTO users_new (id, username, password_hash, full_name, role, class_id, english_level, security_question,
    security_answer_hash, failed_login_count, failed_reset_count, locked_until, must_change_password, token_version,
    is_active, created_at, updated_at)
SELECT id, username, password_hash, full_name, CASE role WHEN 'admin' THEN 'coordinator' ELSE role END, class_id, NULL,
    security_question, security_answer_hash, failed_login_count, failed_reset_count, locked_until, must_change_password,
    token_version, is_active, created_at, updated_at
FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
CREATE INDEX idx_users_class_role_name ON users (class_id, role, full_name);
-- Só pode existir UM Administrador (garantido pelo banco, mesmo com cadastros simultâneos)
CREATE UNIQUE INDEX ux_users_single_admin ON users (role) WHERE role = 'admin';

-- 2) access_keys: chaves criam professor ou coordenação (o Administrador é criado uma única vez, sem chave)
CREATE TABLE access_keys_new (
    id INTEGER PRIMARY KEY,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    key_hint VARCHAR(12) NOT NULL,
    role VARCHAR(12) NOT NULL CHECK (role IN ('teacher', 'coordinator')),
    max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
    use_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP,
    revoked_at TIMESTAMP,
    label VARCHAR(80),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO access_keys_new
SELECT id, key_hash, key_hint, CASE role WHEN 'admin' THEN 'coordinator' ELSE role END, max_uses, use_count,
    expires_at, revoked_at, label, created_by, created_at
FROM access_keys;
DROP TABLE access_keys;
ALTER TABLE access_keys_new RENAME TO access_keys;

-- 3) subjects: nível de inglês (2, 3, 4) e agenda fixa de prova (grupo 1/2 + dia: 2=terça, 4=quinta, 5=sexta)
ALTER TABLE subjects ADD COLUMN english_level INTEGER CHECK (english_level IN (2, 3, 4));
ALTER TABLE subjects ADD COLUMN exam_group INTEGER CHECK (exam_group IN (1, 2));
ALTER TABLE subjects ADD COLUMN exam_weekday INTEGER CHECK (exam_weekday IN (2, 4, 5));

-- 4) calendar_events: eventos gerados automaticamente pelo calendário de provas
ALTER TABLE calendar_events ADD COLUMN bimester INTEGER CHECK (bimester BETWEEN 1 AND 4);
ALTER TABLE calendar_events ADD COLUMN exam_number INTEGER CHECK (exam_number BETWEEN 1 AND 4);
ALTER TABLE calendar_events ADD COLUMN source VARCHAR(6) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto'));
CREATE INDEX idx_calendar_auto ON calendar_events (source, bimester);

-- 5) Calendário de provas por bimestre: 8 semanas seguidas alternando grupos (G1/G2 4× cada = P1..P4)
CREATE TABLE exam_schedules (
    id INTEGER PRIMARY KEY,
    school_year INTEGER NOT NULL,
    bimester INTEGER NOT NULL CHECK (bimester BETWEEN 1 AND 4),
    first_tuesday DATE NOT NULL,
    starting_group INTEGER NOT NULL DEFAULT 1 CHECK (starting_group IN (1, 2)),
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (school_year, bimester)
);

-- 6) Conteúdos das provas (publicados pela Coordenação/Administrador)
CREATE TABLE study_contents (
    id INTEGER PRIMARY KEY,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    bimester INTEGER NOT NULL CHECK (bimester BETWEEN 1 AND 4),
    exam_number INTEGER CHECK (exam_number BETWEEN 1 AND 4),
    title VARCHAR(120) NOT NULL,
    body TEXT NOT NULL,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_contents_bimester_subject ON study_contents (bimester, subject_id, exam_number);
