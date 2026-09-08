import type { GuestRow } from "../guests";
import { getComing, getDeclined } from "./queries";
import { db } from "../db";

export type CsvList = "attending" | "declined" | "all";

function csvField(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(csvField).join(",")];
  for (const row of rows) lines.push(row.map(csvField).join(","));
  return lines.join("\r\n");
}

function yesNo(v: number): string {
  return v === 1 ? "yes" : "no";
}

function attendingLabel(v: number | null): string {
  if (v === 1) return "coming";
  if (v === 0) return "not coming";
  return "no answer";
}

function comingCsv(): string {
  const rows = getComing().map((g) => [
    g.name,
    g.adults,
    g.kids,
    g.adults + g.kids,
    yesNo(g.is_musician),
    g.diet ?? "",
    g.message ?? "",
    g.updated_at,
  ]);
  return toCsv(["Name", "Adults", "Kids", "Heads", "Musician", "Diet", "Message", "Updated"], rows);
}

function declinedCsv(): string {
  const rows = getDeclined().map((g) => [g.name, g.message ?? "", g.updated_at]);
  return toCsv(["Name", "Message", "Updated"], rows);
}

function allCsv(): string {
  const guests = db
    .query<GuestRow, []>("SELECT * FROM guest WHERE merged_into IS NULL ORDER BY name_normalised")
    .all();
  const rows = guests.map((g) => [
    g.name,
    attendingLabel(g.attending),
    g.adults,
    g.kids,
    yesNo(g.is_musician),
    g.diet ?? "",
    g.message ?? "",
    g.updated_at,
  ]);
  return toCsv(["Name", "Attending", "Adults", "Kids", "Musician", "Diet", "Message", "Updated"], rows);
}

export function guestsCsv(list: CsvList): string {
  if (list === "declined") return declinedCsv();
  if (list === "all") return allCsv();
  return comingCsv();
}
