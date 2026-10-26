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
  'attestation_verifier_proof_ref',
  // Last, so the columns before it keep their places.
  'caller_message',
] as const;

/**
 * The time a record was received, marked as UTC. The server sends it without
 * an offset and means UTC, as the rest of the dashboard reads it; a
 * spreadsheet would read a time without one as local time.
 */
function utc(createdAt: string): string {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(createdAt) ? createdAt : `${createdAt}Z`;
}

function row(r: LedgerRecord): (string | null | undefined)[] {
  const { result } = r;
  const block = result.attestationBlock;
  return [
    r.id,
    utc(r.createdAt),
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
    // Kept apart from proof_ref: the verifier's proof_ref was not admitted.
    block?.proofRef,
    // Kept apart from verifier_message: the verifier did not write it.
    result.callerMessage,
  ];
}

// A cell a spreadsheet may read as a formula: one that starts with a tab,
// carriage return, line feed or NUL, or with =, +, - or @ (or their
// full-width forms) after any leading white space, which some imports trim.
const FORMULA_START = /^(?:[\t\r\n\0]|[\s\0]*[=+\-@＝＋－＠])/;

/**
 * One cell, quoted as RFC 4180 needs. A cell a spreadsheet may read as a
 * formula gets a leading apostrophe: requests and messages come from AI
 * output and callers, so the file must not run them when it is opened.
 */
export function csvCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = FORMULA_START.test(value) ? `'${value}` : value;
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
