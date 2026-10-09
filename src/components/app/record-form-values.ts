/** Converting a form's string values into an API body. */

export type FieldValue = string | boolean;

/** Blank → undefined; otherwise the number (NaN is caught by the pre-check). */
export const optNum = (v: FieldValue | undefined) => (v === undefined || v === "" ? undefined : Number(v));
/** Blank → null, for clearing a nullable field on edit. */
export const nullNum = (v: FieldValue | undefined) => (v === undefined || v === "" ? null : Number(v));
export const optText = (v: FieldValue | undefined) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
export const nullText = (v: FieldValue | undefined) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
