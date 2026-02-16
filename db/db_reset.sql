-- ======================================================
-- IPP System DB Schema (ONE Excel + ONE DOCX per year)
-- NO is_active, NO versions
-- ======================================================

DROP TABLE IF EXISTS generation_history CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TABLE IF EXISTS generation_settings CASCADE;

DROP TABLE IF EXISTS docx_placeholders CASCADE;
DROP TABLE IF EXISTS docx_templates CASCADE;

DROP TABLE IF EXISTS excel_rows CASCADE;
DROP TABLE IF EXISTS excel_columns CASCADE;
DROP TABLE IF EXISTS excel_templates CASCADE;

DROP TABLE IF EXISTS placeholder_catalog CASCADE;

DROP TABLE IF EXISTS teachers CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

-- =========================
-- CORE
-- =========================
CREATE TABLE departments (
    id   BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE teachers (
    id              BIGSERIAL PRIMARY KEY,
    full_name       TEXT NOT NULL,
    department_id   BIGINT REFERENCES departments(id) ON DELETE SET NULL,

    faculty         TEXT,
    position        TEXT,
    academic_degree TEXT,
    academic_rank   TEXT,
    staff_type      TEXT,

    extra_data      JSONB,

    CONSTRAINT uq_teacher_dept_name UNIQUE (department_id, full_name)
);

-- =========================
-- PLACEHOLDERS CATALOG (ONLY STABLE)
-- =========================
CREATE TABLE placeholder_catalog (
    id               BIGSERIAL PRIMARY KEY,
    placeholder_name TEXT NOT NULL UNIQUE,
    placeholder_type TEXT NOT NULL,
    category         TEXT NOT NULL,
    description      TEXT,
    example          TEXT,
    created_at       TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT ck_catalog_type CHECK (placeholder_type IN ('text')),
    CONSTRAINT ck_catalog_cat  CHECK (category IN ('teacher'))
);

-- =========================
-- EXCEL (ONE per dept+year)
-- =========================
CREATE TABLE excel_templates (
    id              BIGSERIAL PRIMARY KEY,
    department_id   BIGINT REFERENCES departments(id) ON DELETE CASCADE,
    academic_year   TEXT NOT NULL,

    file_path       TEXT NOT NULL,
    source_filename TEXT,

    column_schema   JSONB,

    status          TEXT NOT NULL DEFAULT 'parsed',
    error_text      TEXT,

    created_at      TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT uq_excel_dept_year UNIQUE (department_id, academic_year)
);

CREATE TABLE excel_columns (
    id             BIGSERIAL PRIMARY KEY,
    template_id    BIGINT REFERENCES excel_templates(id) ON DELETE CASCADE,

    column_name    TEXT NOT NULL,
    header_text    TEXT NOT NULL,
    position_index INT NOT NULL,

    CONSTRAINT uq_excel_col_pos UNIQUE (template_id, position_index),
    CONSTRAINT uq_excel_col_name UNIQUE (template_id, column_name)
);

CREATE TABLE excel_rows (
    id          BIGSERIAL PRIMARY KEY,
    template_id BIGINT REFERENCES excel_templates(id) ON DELETE CASCADE,

    teacher_id  BIGINT REFERENCES teachers(id) ON DELETE SET NULL,
    row_number  INT,
    row_data    JSONB NOT NULL,

    created_at  TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT uq_excel_rownum UNIQUE (template_id, row_number)
);

-- =========================
-- DOCX (ONE per dept+year) + MUST be tied to Excel of same year
-- Deleting Excel -> deletes DOCX via FK cascade
-- =========================
CREATE TABLE docx_templates (
    id                 BIGSERIAL PRIMARY KEY,
    department_id      BIGINT REFERENCES departments(id) ON DELETE CASCADE,
    academic_year      TEXT NOT NULL,

    excel_template_id  BIGINT NOT NULL REFERENCES excel_templates(id) ON DELETE CASCADE,

    file_path          TEXT NOT NULL,
    source_filename    TEXT,

    placeholder_schema JSONB,

    status             TEXT NOT NULL DEFAULT 'parsed',
    error_text         TEXT,

    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT uq_docx_dept_year UNIQUE (department_id, academic_year)
);

CREATE TABLE docx_placeholders (
    id               BIGSERIAL PRIMARY KEY,
    template_id      BIGINT REFERENCES docx_templates(id) ON DELETE CASCADE,
    placeholder_name TEXT NOT NULL,
    placeholder_type TEXT NOT NULL,
    extra_meta       JSONB,

    CONSTRAINT ck_docx_ph_type CHECK (placeholder_type IN ('text','loop'))
);

CREATE UNIQUE INDEX uq_docx_placeholder_basic
ON docx_placeholders(template_id, placeholder_name, placeholder_type);

-- =========================
-- GENERATION SETTINGS
-- Store mapping for Excel template (so Settings works BEFORE DOCX upload)
-- ONE per excel_template_id
-- =========================
CREATE TABLE generation_settings (
    id                BIGSERIAL PRIMARY KEY,
    excel_template_id BIGINT NOT NULL REFERENCES excel_templates(id) ON DELETE CASCADE,

    config            JSONB NOT NULL,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT uq_gen_settings_excel UNIQUE (excel_template_id),
    CONSTRAINT ck_gen_settings_config CHECK (jsonb_typeof(config) = 'object')
);

-- =========================
-- AUTH / USERS
-- =========================
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT NOT NULL,          -- admin | teacher | guest
    department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL,
    teacher_id BIGINT REFERENCES teachers(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT ck_user_role CHECK (role IN ('admin','teacher','guest'))
);

-- =========================
-- GENERATION HISTORY
-- =========================
CREATE TABLE generation_history (
    id BIGSERIAL PRIMARY KEY,

    generated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    generated_by_role TEXT NOT NULL,
    generated_for_teacher_id BIGINT REFERENCES teachers(id) ON DELETE SET NULL,

    department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL,
    academic_year TEXT NOT NULL,

    excel_template_id BIGINT REFERENCES excel_templates(id) ON DELETE SET NULL,
    docx_template_id  BIGINT REFERENCES docx_templates(id) ON DELETE SET NULL,

    output_path TEXT,
    file_name TEXT,

    status TEXT NOT NULL DEFAULT 'success',
    error_text TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT ck_gen_hist_role CHECK (generated_by_role IN ('admin','teacher')),
    CONSTRAINT ck_gen_hist_status CHECK (status IN ('success','error'))
);

CREATE INDEX ix_gen_hist_for_teacher_time
ON generation_history(generated_for_teacher_id, created_at DESC);

CREATE INDEX ix_gen_hist_by_user_time
ON generation_history(generated_by_user_id, created_at DESC);

CREATE INDEX ix_gen_hist_department_time
ON generation_history(department_id, created_at DESC);

-- =========================
-- SEED
-- =========================
INSERT INTO departments (name)
VALUES ('Математическое и компьютерное моделирование');

INSERT INTO teachers (full_name, department_id, faculty, position, academic_degree, staff_type)
VALUES (
    'Алтайбек Айжан Алтайбекқызы',
    1,
    'Факультет Компьютерных технологий и кибербезопасности',
    'Ассоциированный профессор',
    'PhD',
    'штатный'
);

-- admin123
INSERT INTO users (username, password_hash, role, department_id)
VALUES ('dept_admin', '$2b$12$dLKdTeXx3.ny13U8EYMXtORgdUEkJ/c6Kit5j4vmlMDgO0cZt/9VS', 'admin', 1);

-- teacher123
INSERT INTO users (username, password_hash, role, teacher_id, department_id)
VALUES ('teacher1', '$2b$12$O1M4JS.K7Mna4S78wf5h2eqIrhHgEyhxJrts0gojwDdB.buEjHPLW', 'teacher', 1, 1);

-- guest123
INSERT INTO users (username, password_hash, role)
VALUES ('guest', '$2b$12$aH6n80.iAvKNHPHil0vFtOCKebIzsXxPeiQnKwzq7ZXCCaDoVbjMW', 'guest');

-- stable teacher placeholders
INSERT INTO placeholder_catalog (placeholder_name, placeholder_type, category, description, example) VALUES
('teacher.staff_type',      'text', 'teacher', 'Тип ставки/штатности', '{{ teacher.staff_type }}'),
('teacher.position',        'text', 'teacher', 'Должность',            '{{ teacher.position }}'),
('teacher.academic_degree', 'text', 'teacher', 'Учёная степень',       '{{ teacher.academic_degree }}'),
('teacher.full_name',       'text', 'teacher', 'ФИО преподавателя',    '{{ teacher.full_name }}'),
('teacher.department',      'text', 'teacher', 'Кафедра',              '{{ teacher.department }}'),
('teacher.faculty',         'text', 'teacher', 'Факультет',            '{{ teacher.faculty }}');
