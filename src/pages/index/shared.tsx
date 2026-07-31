// Единая точка реэкспорта — весь публичный API этого модуля разложен по 4 файлам
// (sharedTypes/sharedConstants/sharedHelpers/sharedComponents), чтобы не держать один большой
// файл. Другие модули продолжают импортировать всё отсюда (`from './shared'` /
// `from '../index/shared'`) без изменений.
export * from './sharedTypes';
export * from './sharedConstants';
export * from './sharedHelpers';
export * from './sharedComponents';
