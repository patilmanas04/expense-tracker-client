import { countsAs, type Txn } from "./analytics";
import { MANUAL, categoryName } from "./categories";
import { amountCell, toCsv, type CsvCell } from "./csv-format";
import { timeLabel24, toMinor } from "./format";

/** The export's columns, in order. */
export const CSV_COLUMNS = [
  "Date",
  "Time",
  "Type",
  "Amount",
  "Currency",
  "Merchant",
  "Category",
  "Counts as",
  "Lent / borrowed",
  "Account",
  "Reference",
  "Note",
  "Source",
  "SMS text",
] as const;

const text = (value: string): CsvCell => ({ value, text: true });
const plain = (value: string): CsvCell => ({ value, text: false });

/**
 * One row per transaction, in the order given. Unreadable SMS leave Type, Amount, Merchant, Category and
 * Lent / borrowed empty (their values are placeholders), so a spreadsheet sum never sees a fake amount.
 * "Lent / borrowed" is the part in lend & borrow entries (shares, loans, repayments; "0.00" when none):
 * Amount minus it is what counts.
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
      plain(t.is_parsed ? amountCell(toMinor(t.linked_amount)) : ""),
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
