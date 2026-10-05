-- 0001_init (up) — gerado de docs/database/schema.sql
-- Turmas de um ano letivo (ex.: "1º Ano A" em 2026)
CREATE TABLE school_classes (
    id INTEGER PRIMARY KEY,
    name VARCHAR(40) NOT NULL,
    school_year INTEGER NOT NULL CHECK (school_year BETWEEN 2000 AND 2100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name, school_year)
);

-- Matérias (Matemática, Português...)
CREATE TABLE subjects (
    id INTEGER PRIMARY KEY,
    name VARCHAR(60) NOT NULL UNIQUE,
    color_hex VARCHAR(7) NOT NULL DEFAULT '#4F46E5',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Usuários: aluno, professor, admin
CREATE TABLE users (
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

-- Chaves de acesso para criar contas de professor/admin
CREATE TABLE access_keys (
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

-- Qual professor leciona qual matéria em qual turma (menor privilégio)
CREATE TABLE teaching_assignments (
    id INTEGER PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (teacher_id, class_id, subject_id)
);

-- Notas por matéria e bimestre (regras em docs/regras-de-notas.md):
--   exam1..exam4: provas, 0 a 8,0 cada | project, homework: 0 a 1,0 | mock (simulado, opcional): 0 a 1,0
--   média do bimestre = min(10, média das provas + projeto + tarefa + simulado); ≥ 6,0 sem recuperação
CREATE TABLE grades (
    id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    bimester INTEGER NOT NULL CHECK (bimester BETWEEN 1 AND 4),
    component VARCHAR(10) NOT NULL CHECK (component IN ('exam1', 'exam2', 'exam3', 'exam4', 'project', 'homework', 'mock')),
    score DECIMAL(4,2) NOT NULL CHECK (
        (component LIKE 'exam_' AND score BETWEEN 0 AND 8)
        OR (component IN ('project', 'homework', 'mock') AND score BETWEEN 0 AND 1)
    ),
    graded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (student_id, class_id, subject_id, bimester, component)
);

-- Avisos (class_id NULL = escola inteira)
CREATE TABLE announcements (
    id INTEGER PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    body TEXT NOT NULL,
    category VARCHAR(20) NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'exam', 'event', 'urgent')),
    class_id INTEGER REFERENCES school_classes(id) ON DELETE CASCADE,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE announcement_reads (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, announcement_id)
);

-- Tarefas de casa
CREATE TABLE homework (
    id INTEGER PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    description TEXT,
    class_id INTEGER NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    due_date DATE NOT NULL,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE homework_completions (
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    homework_id INTEGER NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
    completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (student_id, homework_id)
);

-- Calendário escolar (class_id NULL = escola inteira)
CREATE TABLE calendar_events (
    id INTEGER PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    description TEXT,
    event_type VARCHAR(20) NOT NULL DEFAULT 'event' CHECK (event_type IN ('exam', 'holiday', 'event', 'meeting', 'deadline')),
    starts_on DATE NOT NULL,
    ends_on DATE,
    class_id INTEGER REFERENCES school_classes(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

-- Rotina de estudos semanal (criada pelo próprio aluno)
CREATE TABLE study_routines (
    id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time VARCHAR(5) NOT NULL,
    end_time VARCHAR(5) NOT NULL,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    activity VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (end_time > start_time)
);

CREATE TABLE study_routine_checks (
    routine_id INTEGER NOT NULL REFERENCES study_routines(id) ON DELETE CASCADE,
    done_on DATE NOT NULL,
    PRIMARY KEY (routine_id, done_on)
);

-- Trilha de auditoria (repúdio: quem alterou nota, criou chave, resetou senha)
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(40) NOT NULL,
    entity VARCHAR(40) NOT NULL,
    entity_id INTEGER,
    details TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices (skill database-designer: index_optimizer + curadoria contra over-indexing).
-- Já cobertos por PK/UNIQUE (prefixo à esquerda): login (users.username), boletim do aluno
-- (grades UNIQUE student_id,class_id,...), avisos lidos, tarefas concluídas, checks de rotina,
-- turmas do professor e validação de chave de acesso.
CREATE INDEX idx_grades_sheet ON grades (class_id, subject_id, bimester);
CREATE INDEX idx_users_class_role_name ON users (class_id, role, full_name);
CREATE INDEX idx_announcements_class_created ON announcements (class_id, created_at);
CREATE INDEX idx_homework_class_due ON homework (class_id, due_date);
CREATE INDEX idx_calendar_starts_class ON calendar_events (starts_on, class_id);
CREATE INDEX idx_routines_student_slot ON study_routines (student_id, weekday, start_time);
CREATE INDEX idx_audit_created ON audit_log (created_at);
