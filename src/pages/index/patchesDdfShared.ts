export interface SearchResult {
  index: number;
  label: string;
  preview: string;
}

export interface FieldDef {
  name: string;
  type: string;
  array: boolean;
  editable: boolean;
}

export interface RawColumn {
  label: string;
  value: string;
}

// Описание "цветовой группы" полей записи (см. _COLOR_FIELD_GROUPS в ddf_registry*.py) — часть
// схем (systemmsg, npcname) хранит RGB(A)-цвет либо одним массивом однобайтовых компонент
// (array=true), либо несколькими отдельными скалярными CHEX-полями (array=false). Эти поля
// раньше были не видны в форме редактирования вообще (массивы исключались из обычного показа) —
// теперь для них показывается отдельный color picker поверх обычных editable-полей.
export interface ColorGroupDef {
  fields: string[];
  array: boolean;
}

export type RowValue = string | number | (string | number)[] | null;
export type Mode = 'search' | 'view' | 'create' | 'bulk' | 'raw';

const NULL_CHAR = String.fromCharCode(0);

export function cleanText(v: RowValue): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  return String(v).split(NULL_CHAR).join('');
}