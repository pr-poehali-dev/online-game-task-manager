-- MD5-хэш содержимого файла патча — нужен для (1) записи атрибута hash= в XML-реестр лаунчера
-- (files.xml на VPS считывает hash реального исходного файла, не архива) и (2) сравнения с
-- file_hash в patch_launcher_uploads, чтобы понимать, устарела ли уже сделанная заливка на VPS
-- после того как файл в патчах был перезалит новой версией.
ALTER TABLE patch_files ADD COLUMN IF NOT EXISTS hash TEXT;
