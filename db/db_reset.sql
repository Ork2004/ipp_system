-- ======================================================
-- IPP System DB Schema
-- ======================================================

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
-- STABLE PLACEHOLDERS CATALOG
-- =========================
CREATE TABLE placeholder_catalog (
    id               BIGSERIAL PRIMARY KEY,
    placeholder_name TEXT NOT NULL UNIQUE,
    placeholder_type TEXT NOT NULL,
    category         TEXT NOT NULL,
    description      TEXT,
    example          TEXT,
    created_at       TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT ck_catalog_type CHECK (placeholder_type IN ('text','loop')),
    CONSTRAINT ck_catalog_cat  CHECK (category IN ('teacher','loop'))
);

-- =========================
-- EXCEL
-- =========================
CREATE TABLE excel_templates (
    id              BIGSERIAL PRIMARY KEY,
    department_id   BIGINT REFERENCES departments(id) ON DELETE SET NULL,
    academic_year   TEXT NOT NULL,

    file_path       TEXT NOT NULL,
    source_filename TEXT,

    column_schema   JSONB,

    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    status          TEXT NOT NULL DEFAULT 'parsed',
    error_text      TEXT,

    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX uq_excel_active_dept_year
ON excel_templates(department_id, academic_year)
WHERE is_active;

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
-- DOCX
-- =========================
CREATE TABLE docx_templates (
    id                 BIGSERIAL PRIMARY KEY,
    department_id      BIGINT REFERENCES departments(id) ON DELETE SET NULL,
    academic_year      TEXT NOT NULL,

    excel_template_id  BIGINT REFERENCES excel_templates(id) ON DELETE SET NULL,

    original_file_path TEXT NOT NULL,
    current_file_path  TEXT NOT NULL,
    source_filename    TEXT,

    placeholder_schema JSONB,
    version            INT NOT NULL DEFAULT 1,

    status             TEXT NOT NULL DEFAULT 'parsed',
    error_text         TEXT,

    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now(),

    is_active          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX uq_docx_active_dept_year
ON docx_templates(department_id, academic_year)
WHERE is_active;

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
-- =========================
CREATE TABLE generation_settings (
    id               BIGSERIAL PRIMARY KEY,

    excel_template_id BIGINT REFERENCES excel_templates(id) ON DELETE CASCADE,
    docx_template_id  BIGINT REFERENCES docx_templates(id) ON DELETE CASCADE,

    config           JSONB NOT NULL,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT ck_gen_settings_config CHECK (jsonb_typeof(config) = 'object')
);

CREATE UNIQUE INDEX uq_gen_settings_active_pair
ON generation_settings(excel_template_id, docx_template_id)
WHERE is_active;

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

INSERT INTO placeholder_catalog (placeholder_name, placeholder_type, category, description, example) VALUES
('teacher.staff_type',      'text', 'teacher', 'Тип ставки/штатности', '{{ teacher.staff_type }}'),
('teacher.position',        'text', 'teacher', 'Должность',            '{{ teacher.position }}'),
('teacher.academic_degree', 'text', 'teacher', 'Учёная степень',       '{{ teacher.academic_degree }}'),
('teacher.full_name',       'text', 'teacher', 'ФИО преподавателя',    '{{ teacher.full_name }}'),
('teacher.department',      'text', 'teacher', 'Кафедра',              '{{ teacher.department }}'),
('teacher.faculty',         'text', 'teacher', 'Факультет',            '{{ teacher.faculty }}'),

('teaching_load_staff_sem1',  'loop', 'loop', 'Таблица: штатная нагрузка 1 семестр',  '{%tr for row in teaching_load_staff_sem1 %}'),
('teaching_load_staff_sem2',  'loop', 'loop', 'Таблица: штатная нагрузка 2 семестр',  '{%tr for row in teaching_load_staff_sem2 %}'),
('teaching_load_hourly_sem1', 'loop', 'loop', 'Таблица: почасовая 1 семестр',         '{%tr for row in teaching_load_hourly_sem1 %}'),
('teaching_load_hourly_sem2', 'loop', 'loop', 'Таблица: почасовая 2 семестр',         '{%tr for row in teaching_load_hourly_sem2 %}');