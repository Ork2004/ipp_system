-- ======================================================
-- IPP System DB Schema
-- FULL RESET
-- Supports:
-- - one Excel per department + year
-- - one DOCX/raw DOCX per department + year
-- - generation settings
-- - generation history
-- - manual table filling
-- - carry-over of manual data between years by table structure
-- ======================================================

DROP TABLE IF EXISTS generation_history CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TABLE IF EXISTS form63_templates CASCADE;

DROP TABLE IF EXISTS teacher_manual_loop_cell_values CASCADE;
DROP TABLE IF EXISTS teacher_manual_loop_rows CASCADE;
DROP TABLE IF EXISTS teacher_manual_static_cell_values CASCADE;
DROP TABLE IF EXISTS teacher_manual_table_snapshots CASCADE;

DROP TABLE IF EXISTS raw_docx_cells CASCADE;
DROP TABLE IF EXISTS raw_docx_tables CASCADE;
DROP TABLE IF EXISTS raw_docx_templates CASCADE;

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
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE teachers (
    id BIGSERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL,

    faculty TEXT,
    position TEXT,
    academic_degree TEXT,
    academic_rank TEXT,
    staff_type TEXT,

    extra_data JSONB,

    CONSTRAINT uq_teacher_dept_name UNIQUE (department_id, full_name)
);

-- =========================
-- PLACEHOLDERS CATALOG (ONLY STABLE)
-- =========================
CREATE TABLE placeholder_catalog (
    id BIGSERIAL PRIMARY KEY,
    placeholder_name TEXT NOT NULL UNIQUE,
    placeholder_type TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    example TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT ck_catalog_type CHECK (placeholder_type IN ('text')),
    CONSTRAINT ck_catalog_cat CHECK (category IN ('teacher'))
);

-- =========================
-- EXCEL (ONE per dept+year)
-- =========================
CREATE TABLE excel_templates (
    id BIGSERIAL PRIMARY KEY,
    department_id BIGINT REFERENCES departments(id) ON DELETE CASCADE,
    academic_year TEXT NOT NULL,

    file_path TEXT NOT NULL,
    source_filename TEXT,

    column_schema JSONB,

    status TEXT NOT NULL DEFAULT 'parsed',
    error_text TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT uq_excel_dept_year UNIQUE (department_id, academic_year)
);

CREATE TABLE excel_columns (
    id BIGSERIAL PRIMARY KEY,
    template_id BIGINT REFERENCES excel_templates(id) ON DELETE CASCADE,

    column_name TEXT NOT NULL,
    header_text TEXT NOT NULL,
    position_index INT NOT NULL,

    CONSTRAINT uq_excel_col_pos UNIQUE (template_id, position_index),
    CONSTRAINT uq_excel_col_name UNIQUE (template_id, column_name)
);

CREATE TABLE excel_rows (
    id BIGSERIAL PRIMARY KEY,
    template_id BIGINT REFERENCES excel_templates(id) ON DELETE CASCADE,

    teacher_id BIGINT REFERENCES teachers(id) ON DELETE SET NULL,
    row_number INT,
    row_data JSONB NOT NULL,

    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT uq_excel_rownum UNIQUE (template_id, row_number)
);

-- =========================
-- DOCX WITH PLACEHOLDERS (legacy/optional)
-- =========================
CREATE TABLE docx_templates (
    id BIGSERIAL PRIMARY KEY,
    department_id BIGINT REFERENCES departments(id) ON DELETE CASCADE,
    academic_year TEXT NOT NULL,

    excel_template_id BIGINT NOT NULL REFERENCES excel_templates(id) ON DELETE CASCADE,

    file_path TEXT NOT NULL,
    source_filename TEXT,

    placeholder_schema JSONB,

    status TEXT NOT NULL DEFAULT 'parsed',
    error_text TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT uq_docx_dept_year UNIQUE (department_id, academic_year)
);

CREATE TABLE docx_placeholders (
    id BIGSERIAL PRIMARY KEY,
    template_id BIGINT REFERENCES docx_templates(id) ON DELETE CASCADE,
    placeholder_name TEXT NOT NULL,
    placeholder_type TEXT NOT NULL,
    extra_meta JSONB,

    CONSTRAINT ck_docx_ph_type CHECK (placeholder_type IN ('text','loop'))
);

CREATE UNIQUE INDEX uq_docx_placeholder_basic
ON docx_placeholders(template_id, placeholder_name, placeholder_type);

-- =========================
-- GENERATION SETTINGS
-- =========================
CREATE TABLE generation_settings (
    id BIGSERIAL PRIMARY KEY,
    excel_template_id BIGINT NOT NULL REFERENCES excel_templates(id) ON DELETE CASCADE,

    config JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

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
-- RAW DOCX SCAN STRUCTURE
-- =========================
CREATE TABLE raw_docx_templates (
    id BIGSERIAL PRIMARY KEY,
    department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    academic_year TEXT NOT NULL,

    file_path TEXT NOT NULL,
    source_filename TEXT,

    scan_schema JSONB,
    tables_count INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'scanned',
    error_text TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_raw_docx_dept_year UNIQUE (department_id, academic_year)
);

CREATE TABLE raw_docx_tables (
    id BIGSERIAL PRIMARY KEY,
    template_id BIGINT NOT NULL REFERENCES raw_docx_templates(id) ON DELETE CASCADE,

    table_index INTEGER NOT NULL,
    section_title TEXT,
    table_type TEXT NOT NULL DEFAULT 'static', -- static | loop

    row_count INTEGER NOT NULL DEFAULT 0,
    col_count INTEGER NOT NULL DEFAULT 0,

    header_signature TEXT,
    has_total_row BOOLEAN NOT NULL DEFAULT FALSE,
    loop_template_row_index INTEGER,
    column_hints JSONB,

    editable_cells_count INTEGER NOT NULL DEFAULT 0,
    prefilled_cells_count INTEGER NOT NULL DEFAULT 0,

    -- NEW: structure-based matching key across academic years
    table_fingerprint TEXT NOT NULL,

    -- extra structure information for flexible matching
    structure_meta JSONB,
    extra_meta JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_raw_table_type CHECK (table_type IN ('static','loop')),
    CONSTRAINT uq_raw_docx_table_index UNIQUE (template_id, table_index)
);

CREATE INDEX ix_raw_docx_tables_template_id
ON raw_docx_tables(template_id);

CREATE INDEX ix_raw_docx_tables_fingerprint
ON raw_docx_tables(table_fingerprint);

CREATE INDEX ix_raw_docx_tables_section_title
ON raw_docx_tables(section_title);

CREATE TABLE raw_docx_cells (
    id BIGSERIAL PRIMARY KEY,
    table_id BIGINT NOT NULL REFERENCES raw_docx_tables(id) ON DELETE CASCADE,

    row_index INTEGER NOT NULL,
    col_index INTEGER NOT NULL,

    cell_key VARCHAR(128) NOT NULL,

    original_text TEXT,
    normalized_text TEXT,

    is_empty BOOLEAN NOT NULL DEFAULT FALSE,
    is_editable BOOLEAN NOT NULL DEFAULT FALSE,

    cell_kind TEXT NOT NULL DEFAULT 'text',

    -- optional semantic helper fields for future smarter matching
    semantic_key TEXT,
    row_signature TEXT,
    column_hint_text TEXT,

    extra_meta JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_raw_cell_kind CHECK (cell_kind IN ('text')),
    CONSTRAINT uq_raw_docx_cell UNIQUE (table_id, row_index, col_index)
);

CREATE INDEX ix_raw_docx_cells_table_id
ON raw_docx_cells(table_id);

CREATE INDEX ix_raw_docx_cells_semantic_key
ON raw_docx_cells(semantic_key);

-- =========================
-- MANUAL DATA SNAPSHOTS
-- Main idea:
-- manual data is saved for a teacher + academic year + current raw table,
-- but also carries structure fields (fingerprint/signature/hints),
-- so next year the system can search previous snapshots by structure
-- instead of only raw_template_id.
-- =========================
CREATE TABLE teacher_manual_table_snapshots (
    id BIGSERIAL PRIMARY KEY,

    teacher_id BIGINT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    academic_year TEXT NOT NULL,

    raw_template_id BIGINT NOT NULL REFERENCES raw_docx_templates(id) ON DELETE CASCADE,
    raw_table_id BIGINT NOT NULL REFERENCES raw_docx_tables(id) ON DELETE CASCADE,

    department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL,

    section_title TEXT,
    table_type TEXT NOT NULL,
    header_signature TEXT,
    column_hints JSONB,
    table_fingerprint TEXT NOT NULL,

    -- tells whether snapshot was created manually or prefilled from previous year
    source_mode TEXT NOT NULL DEFAULT 'manual', -- manual | prefilled | mixed
    prefilled_from_snapshot_id BIGINT REFERENCES teacher_manual_table_snapshots(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_manual_snapshot_table_type CHECK (table_type IN ('static','loop')),
    CONSTRAINT ck_manual_snapshot_source_mode CHECK (source_mode IN ('manual','prefilled','mixed')),

    -- one active snapshot per teacher + year + raw table
    CONSTRAINT uq_manual_snapshot_current UNIQUE (teacher_id, academic_year, raw_table_id)
);

CREATE INDEX ix_manual_snapshots_teacher_year
ON teacher_manual_table_snapshots(teacher_id, academic_year);

CREATE INDEX ix_manual_snapshots_teacher_fingerprint
ON teacher_manual_table_snapshots(teacher_id, table_fingerprint);

CREATE INDEX ix_manual_snapshots_fingerprint
ON teacher_manual_table_snapshots(table_fingerprint);

CREATE INDEX ix_manual_snapshots_section_type
ON teacher_manual_table_snapshots(section_title, table_type);

-- =========================
-- STATIC TABLE VALUES
-- Saved against snapshot, not only against template/cell.
-- This allows copying values into a new year's table by structure.
-- =========================
CREATE TABLE teacher_manual_static_cell_values (
    id BIGSERIAL PRIMARY KEY,

    snapshot_id BIGINT NOT NULL REFERENCES teacher_manual_table_snapshots(id) ON DELETE CASCADE,

    -- optional link to current raw cell of current year template
    raw_cell_id BIGINT REFERENCES raw_docx_cells(id) ON DELETE SET NULL,

    row_index INTEGER NOT NULL,
    col_index INTEGER NOT NULL,

    cell_key VARCHAR(128),
    semantic_key TEXT,
    row_signature TEXT,
    column_hint_text TEXT,

    value_text TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_manual_static_cell UNIQUE (snapshot_id, row_index, col_index)
);

CREATE INDEX ix_manual_static_snapshot_id
ON teacher_manual_static_cell_values(snapshot_id);

CREATE INDEX ix_manual_static_semantic_key
ON teacher_manual_static_cell_values(semantic_key);

-- =========================
-- LOOP ROWS
-- Rows are tied to snapshot.
-- That makes loop data reusable across years by matching snapshots.
-- =========================
CREATE TABLE teacher_manual_loop_rows (
    id BIGSERIAL PRIMARY KEY,

    snapshot_id BIGINT NOT NULL REFERENCES teacher_manual_table_snapshots(id) ON DELETE CASCADE,

    row_order INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_manual_loop_row_order UNIQUE (snapshot_id, row_order)
);

CREATE INDEX ix_manual_loop_rows_snapshot
ON teacher_manual_loop_rows(snapshot_id);

CREATE TABLE teacher_manual_loop_cell_values (
    id BIGSERIAL PRIMARY KEY,

    loop_row_id BIGINT NOT NULL REFERENCES teacher_manual_loop_rows(id) ON DELETE CASCADE,

    col_index INTEGER NOT NULL,
    column_hint_text TEXT,
    semantic_key TEXT,

    value_text TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_manual_loop_cell UNIQUE (loop_row_id, col_index)
);

CREATE INDEX ix_manual_loop_cells_loop_row
ON teacher_manual_loop_cell_values(loop_row_id);

CREATE INDEX ix_manual_loop_cells_semantic_key
ON teacher_manual_loop_cell_values(semantic_key);

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
    docx_template_id BIGINT REFERENCES docx_templates(id) ON DELETE SET NULL,

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
-- FORM 63 TEMPLATES
-- A Form 63 template is an XLSX uploaded by an admin.
-- The system parses its header zone and stores a mapping of
-- column letters per known data category, plus the data start row.
-- This way templates can change layout year over year and the generator
-- still knows where to write each value.
-- =========================
CREATE TABLE form63_templates (
    id BIGSERIAL PRIMARY KEY,
    department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    academic_year TEXT NOT NULL,

    file_path TEXT NOT NULL,
    source_filename TEXT,

    -- {"teacher_name": "D", "position": "G", "semester": "J",
    --  "teaching_auditory": "K", "teaching_extraauditory": "L",
    --  "methodical": "M", "research": "N", "organizational_methodical": "O",
    --  "educational": "P", "qualification": "Q", "social": "R",
    --  "total": "S", "hourly_auditory": "T", "hourly_extraauditory": "U",
    --  "row_number": "C"}
    column_mapping JSONB NOT NULL,

    -- first row where teacher data begins (e.g. 16)
    data_start_row INTEGER NOT NULL,

    -- arbitrary debugging/preview info from the parser
    detection_meta JSONB,

    status TEXT NOT NULL DEFAULT 'parsed',
    error_text TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_form63_status CHECK (status IN ('parsed','error')),
    CONSTRAINT uq_form63_dept_year UNIQUE (department_id, academic_year)
);

CREATE INDEX ix_form63_templates_dept
ON form63_templates(department_id);

-- =========================
-- SEED
-- =========================
INSERT INTO departments (name)
VALUES ('Математическое и компьютерное моделирование');

INSERT INTO teachers (
    full_name,
    department_id,
    faculty,
    position,
    academic_degree,
    staff_type
)
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
VALUES (
    'dept_admin',
    '$2b$12$dLKdTeXx3.ny13U8EYMXtORgdUEkJ/c6Kit5j4vmlMDgO0cZt/9VS',
    'admin',
    1
);

-- teacher123
INSERT INTO users (username, password_hash, role, teacher_id, department_id)
VALUES (
    'teacher1',
    '$2b$12$O1M4JS.K7Mna4S78wf5h2eqIrhHgEyhxJrts0gojwDdB.buEjHPLW',
    'teacher',
    1,
    1
);

-- guest123
INSERT INTO users (username, password_hash, role)
VALUES (
    'guest',
    '$2b$12$aH6n80.iAvKNHPHil0vFtOCKebIzsXxPeiQnKwzq7ZXCCaDoVbjMW',
    'guest'
);

-- stable teacher placeholders
INSERT INTO placeholder_catalog (
    placeholder_name,
    placeholder_type,
    category,
    description,
    example
) VALUES
('teacher.staff_type',      'text', 'teacher', 'Тип ставки/штатности', '{{ teacher.staff_type }}'),
('teacher.position',        'text', 'teacher', 'Должность',            '{{ teacher.position }}'),
('teacher.academic_degree', 'text', 'teacher', 'Учёная степень',       '{{ teacher.academic_degree }}'),
('teacher.full_name',       'text', 'teacher', 'ФИО преподавателя',    '{{ teacher.full_name }}'),
('teacher.department',      'text', 'teacher', 'Кафедра',              '{{ teacher.department }}'),
('teacher.faculty',         'text', 'teacher', 'Факультет',            '{{ teacher.faculty }}');