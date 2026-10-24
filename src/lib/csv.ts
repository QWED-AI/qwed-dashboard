import type { LedgerRecord } from './result';

// The ledger as a CSV file, built in the browser from the records it has
// loaded. Every value is what the server stored, as the dashboard reads it;
// the file works out no verdict or admission (the verifier is the only
// authority for both). Empty cells mean the server stored no value.

const COLUMNS = [
  'record_id',
  'received_utc',
  'verifier',
  'request',
  'verdict',
  'admission',
  'admission_stored',
  'verifier_message',
  'proof_ref',
  'api_key_id',
  'attestation_refusal',
  'attestation_verifier_verdict',
] as const;

function row(r: LedgerRecord): (string | null | undefined)[] {
  const { result } = r;
  const block = result.attestationBlock;
  return [
    r.id,
    r.createdAt,
    r.domain,
    r.query,
    result.verdict,
    result.admission,
    result.admissionStored,
    result.agentMessage,
    result.proofRef,
    r.apiKeyId,
    block?.constraintId,
    block ? (block.verdict ?? block.verdictStored) : null,
  ];
}

/**
 * One cell, quoted as RFC 4180 needs. A value a spreadsheet would read as a
 * formula (it starts with =, +, -, @, a tab or a carriage return) gets a
 * leading apostrophe: requests and messages come from AI output and callers,
 * so the file must not run them when it is opened.
 */
export function csvCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) || text !== value ? `"${text.replaceAll('"', '""')}"` : text;
}

/** The records as CSV text, header first, with CRLF line ends. */
export function ledgerCsv(records: readonly LedgerRecord[]): string {
  const lines = [COLUMNS.join(','), ...records.map((r) => row(r).map(csvCell).join(','))];
  return `${lines.join('\r\n')}\r\n`;
}

/** Saves the records as a CSV file. The byte order mark lets spreadsheets read it as UTF-8. */
export function downloadLedgerCsv(records: readonly LedgerRecord[], now: Date = new Date()): void {
  const blob = new Blob(['﻿', ledgerCsv(records)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qwed-ledger-${now.toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
