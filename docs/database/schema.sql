-- Escola+ — schema atual (gerado do banco após as migrações 0001 + 0002). Fonte da verdade: server/migrations/.
-- Escopo de dados mínimo (decisão #4): sem CPF, endereço, telefone ou foto.

CREATE TABLE school_classes (
    id INTEGER PRIMARY KEY,
    name VARCHAR(40) NOT NULL,
    school_year INTEGER NOT NULL CHECK (school_year BETWEEN 2000 AND 2100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name, school_year)
);

CREATE TABLE subjects (
    id INTEGER PRIMARY KEY,
    name VARCHAR(60) NOT NULL UNIQUE,
    color_hex VARCHAR(7) NOT NULL DEFAULT '#4F46E5',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
, english_level INTEGER CHECK (english_level IN (2, 3, 4)), exam_group INTEGER CHECK (exam_group IN (1, 2)), exam_weekday INTEGER CHECK (exam_weekday IN (2, 4, 5)));

CREATE TABLE teaching_assignments (
    id INTEGER PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id INTEGER NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (teacher_id, class_id, subject_id)
);

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
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, bimester INTEGER CHECK (bimester BETWEEN 1 AND 4), exam_number INTEGER CHECK (exam_number BETWEEN 1 AND 4), source VARCHAR(6) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto')),
    CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

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

CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(40) NOT NULL,
    entity VARCHAR(40) NOT NULL,
    entity_id INTEGER,
    details TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "users" (
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

CREATE TABLE "access_keys" (
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

CREATE INDEX idx_grades_sheet ON grades (class_id, subject_id, bimester);

CREATE INDEX idx_announcements_class_created ON announcements (class_id, created_at);

CREATE INDEX idx_homework_class_due ON homework (class_id, due_date);

CREATE INDEX idx_calendar_starts_class ON calendar_events (starts_on, class_id);

CREATE INDEX idx_routines_student_slot ON study_routines (student_id, weekday, start_time);

CREATE INDEX idx_audit_created ON audit_log (created_at);

CREATE INDEX idx_users_class_role_name ON users (class_id, role, full_name);

CREATE UNIQUE INDEX ux_users_single_admin ON users (role) WHERE role = 'admin';

CREATE INDEX idx_calendar_auto ON calendar_events (source, bimester);

CREATE INDEX idx_contents_bimester_subject ON study_contents (bimester, subject_id, exam_number);
CREATE INDEX idx_calendar_subject_exam ON calendar_events (subject_id, bimester, exam_number);
