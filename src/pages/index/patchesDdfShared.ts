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

export type RowValue = string | number | (string | number)[] | null;
export type Mode = 'search' | 'view' | 'create' | 'bulk' | 'raw';

const NULL_CHAR = String.fromCharCode(0);

export function cleanText(v: RowValue): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  return String(v).split(NULL_CHAR).join('');
}