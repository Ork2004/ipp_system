-- Additive migration: add form63_templates table.
-- Run this if you don't want to drop and recreate the whole schema via db_reset.sql.

CREATE TABLE IF NOT EXISTS form63_templates (
    id BIGSERIAL PRIMARY KEY,
    department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    academic_year TEXT NOT NULL,

    file_path TEXT NOT NULL,
    source_filename TEXT,

    column_mapping JSONB NOT NULL,
    data_start_row INTEGER NOT NULL,

    detection_meta JSONB,

    status TEXT NOT NULL DEFAULT 'parsed',
    error_text TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_form63_status CHECK (status IN ('parsed','error')),
    CONSTRAINT uq_form63_dept_year UNIQUE (department_id, academic_year)
);

CREATE INDEX IF NOT EXISTS ix_form63_templates_dept
ON form63_templates(department_id);
