ALTER TABLE servers ADD COLUMN IF NOT EXISTS protocol TEXT NOT NULL DEFAULT 'hf';
ALTER TABLE servers ADD COLUMN IF NOT EXISTS description TEXT;

-- Существующие серверы: c4x1 использует протокол C4 (отдельная ddf-схема, см.
-- backend/patches/index.py), hfx3old/hfnew — протокол HF (основная ddf-схема).
UPDATE servers SET protocol = 'c4' WHERE id = 'c4x1';
UPDATE servers SET protocol = 'hf' WHERE id IN ('hfx3old', 'hfnew');
