import { countsAs, type Txn } from "./analytics";
import { MANUAL, categoryName } from "./categories";
import { amountCell, toCsv, type CsvCell } from "./csv-format";
import { timeLabel24 } from "./format";

/** The export's columns, in order. Doc 15 adds "Lent / borrowed" after "Counts as". */
export const CSV_COLUMNS = [
  "Date",
  "Time",
  "Type",
  "Amount",
  "Currency",
  "Merchant",
  "Category",
  "Counts as",
  "Account",
  "Reference",
  "Note",
  "Source",
  "SMS text",
] as const;

const text = (value: string): CsvCell => ({ value, text: true });
const plain = (value: string): CsvCell => ({ value, text: false });

/**
 * One row per transaction, in the order given. Unreadable SMS leave Type, Amount, Merchant and
 * Category empty (their values are placeholders), so a spreadsheet sum never sees a fake amount.
 */
export function transactionRows(txns: Txn[]): CsvCell[][] {
  return txns.map((t) => {
    const manual = t.parsed_by === MANUAL;
    return [
      plain(t.day),
      plain(timeLabel24(t.transaction_time)),
      text(t.is_parsed ? (t.type === "DEBIT" ? "Debit" : "Credit") : ""),
      plain(t.is_parsed ? amountCell(t.minor) : ""),
      text(t.currency),
      text(t.is_parsed ? (t.merchant ?? "") : ""),
      text(t.is_parsed ? categoryName(t) : ""),
      text(countsAs(t)),
      text(t.account_ref ?? ""),
      text(t.reference_id ?? ""),
      text(t.notes ?? ""),
      text(manual ? "Added by hand" : "SMS"),
      text(manual ? "" : t.raw_message),
    ];
  });
}

/** The whole file: the header, then one row per transaction. */
export function transactionsCsv(txns: Txn[]): string {
  return toCsv([CSV_COLUMNS.map(text), ...transactionRows(txns)]);
}
