import type { AuditLog, Jwks } from '../../api/types';

// Made by a local qwed-verification 8.0.0 server (#54), not built in the test:
// three documents from POST /verification-context/from-diagnostic, the audit
// rows the server stored for them (as GET /audit/logs lists them, without the
// chain fields), its JWKS, and what qwed-verification computes for each:
// compute_document_hash of the document it signed and of the copy it
// stored, and the canonical encoding of that copy without its attestation.
//
// - admitted: a VERIFIED math result the server signed with ADMIT.
// - tricky: a caller's UNVERIFIABLE diagnostic with non-ASCII and astral
//   text, escapes, keys whose UTF-16 order differs from their code point
//   order, and numbers ECMAScript formats in its own way.
// - redacted: one with an email, which the server replaces in the copy it
//   stores, after signing; that copy's hash differs from the signed one.
//
// The tokens were issued on 27 Oct 2026 and last 24 hours, so a test checks
// them at ISSUED_AT.

export interface ContextFixture {
  row: AuditLog;
  signedHash: string;
  storedHash: string;
  storedCanonical: string;
}

export const contextFixtures: { jwks: Jwks; documents: Record<'admitted' | 'tricky' | 'redacted', ContextFixture> } =
{
  "jwks": {
    "keys": [
      {
        "crv": "P-256",
        "kty": "EC",
        "x": "0QdnzSGxpFPbxWm4DomMOx_gu2jrNu88dNuXkQE2-c0",
        "y": "MaukJkzH6LZcfhCox_lfNXVPwq2FcMe5bJ8Yxg_8JYs",
        "kid": "did:qwed:node:local#gIdnTMU_OFzP6t_xSmDXblGcxMsNkKQ-tdLcmhgEdZc",
        "alg": "ES256",
        "use": "sig"
      }
    ]
  },
  "documents": {
    "admitted": {
      "row": {
        "id": "83",
        "request_input": "2 + 2 = 4",
        "verification_result": "{\"spec_version\": \"1.1\", \"object\": {\"formal_statement\": \"2 + 2 = 4\", \"formalization\": {\"verified\": false, \"source_query\": \"2 + 2 = 4\", \"translator\": \"math\"}}, \"context\": {\"interpretation\": {\"theory\": \"math verification\"}, \"proof\": {\"verifier\": \"math\", \"verifier_version\": \"7.3.0\", \"outcome_treatment\": \"unknown/timeout/error resolve to UNVERIFIABLE or BLOCKED\"}, \"evidence\": {\"evidence\": {\"status\": \"VERIFIED\", \"agent_message\": \"Built from a diagnostic the caller supplied; QWED did not produce its message or fields\", \"developer_fields\": {\"constraint_id\": \"verification_context.attested_admit\", \"caller_supplied\": {\"agent_message\": \"Identity is true\", \"developer_fields\": {\"is_valid\": true, \"result\": true, \"left_side\": \"4\", \"right_side\": \"4\", \"simplified_difference\": \"0\"}, \"verifier\": \"math\", \"verifier_version\": null}, \"is_valid\": true, \"attested_admission\": \"ADMIT\"}, \"proof_ref\": \"sha256:a5f3eb1175437d507d28bea1d2bc229ce518fd0e4eb861c5f69e8ccef8a0e8ec\", \"is_authoritative\": true}, \"proof_ref\": \"sha256:46dedb0451b7cfb6dac8d22a248c9e1f98170e3f6e10c1d2e020cdcba15965f1\"}, \"decision\": {\"admission\": \"ADMIT\"}}, \"verdict\": \"VERIFIED\", \"attestation\": \"eyJhbGciOiJFUzI1NiIsImtpZCI6ImRpZDpxd2VkOm5vZGU6bG9jYWwjZ0lkblRNVV9PRnpQNnRfeFNtRFhibEdjeE1zTmtLUS10ZExjbWhnRWRaYyIsInR5cCI6InF3ZWQtY29udGV4dCtqd3QifQ.eyJpc3MiOiJkaWQ6cXdlZDpub2RlOmxvY2FsIiwic3ViIjoic2hhMjU2OmU1ZmMwNzA1MjIzZmNkOTdkNWIzNjc4MTNkYmM4MmI2MTgzODk2OWM5ZjVhNWFjMzY4YTFmNjkzMjA2OTQzZmEiLCJpYXQiOjE3OTMwOTIyNDgsImV4cCI6MTc5MzE3ODY0OCwianRpIjoiYXR0X2U0MTI3ZTY5ZDg3YiIsInF3ZWQiOnsidmVyc2lvbiI6IjEuMSIsImRvY3VtZW50X2hhc2giOiJzaGEyNTY6ZTVmYzA3MDUyMjNmY2Q5N2Q1YjM2NzgxM2RiYzgyYjYxODM4OTY5YzlmNWE1YWMzNjhhMWY2OTMyMDY5NDNmYSIsInZlcmRpY3QiOiJWRVJJRklFRCIsImFkbWlzc2lvbiI6IkFETUlUIiwicHJvb2ZfcmVmIjoic2hhMjU2OjQ2ZGVkYjA0NTFiN2NmYjZkYWM4ZDIyYTI0OGM5ZTFmOTgxNzBlM2Y2ZTEwYzFkMmUwMjBjZGNiYTE1OTY1ZjEifX0.vGX5jNE5oeDPrb2Oerhjza5J8Fiu9mq1bOwQLCCbbYJnJMG8T5RW9W4Vo6y0t2vTgko7wJDBBmXSZ24kCv6AHA\"}",
        "engine_used": "VERIFICATION_CONTEXT",
        "verdict": "VERIFIED",
        "status": "verified",
        "admission": "ADMIT",
        "latency_ms": 0,
        "created_at": "2026-10-27T09:10:48.280784+00:00",
        "api_key_id": "1",
        "verifier_version": "8.0.0"
      },
      "signedHash": "sha256:e5fc0705223fcd97d5b367813dbc82b61838969c9f5a5ac368a1f693206943fa",
      "storedHash": "sha256:e5fc0705223fcd97d5b367813dbc82b61838969c9f5a5ac368a1f693206943fa",
      "storedCanonical": "{\"context\":{\"decision\":{\"admission\":\"ADMIT\"},\"evidence\":{\"evidence\":{\"agent_message\":\"Built from a diagnostic the caller supplied; QWED did not produce its message or fields\",\"developer_fields\":{\"attested_admission\":\"ADMIT\",\"caller_supplied\":{\"agent_message\":\"Identity is true\",\"developer_fields\":{\"is_valid\":true,\"left_side\":\"4\",\"result\":true,\"right_side\":\"4\",\"simplified_difference\":\"0\"},\"verifier\":\"math\",\"verifier_version\":null},\"constraint_id\":\"verification_context.attested_admit\",\"is_valid\":true},\"is_authoritative\":true,\"proof_ref\":\"sha256:a5f3eb1175437d507d28bea1d2bc229ce518fd0e4eb861c5f69e8ccef8a0e8ec\",\"status\":\"VERIFIED\"},\"proof_ref\":\"sha256:46dedb0451b7cfb6dac8d22a248c9e1f98170e3f6e10c1d2e020cdcba15965f1\"},\"interpretation\":{\"theory\":\"math verification\"},\"proof\":{\"outcome_treatment\":\"unknown/timeout/error resolve to UNVERIFIABLE or BLOCKED\",\"verifier\":\"math\",\"verifier_version\":\"7.3.0\"}},\"object\":{\"formal_statement\":\"2 + 2 = 4\",\"formalization\":{\"source_query\":\"2 + 2 = 4\",\"translator\":\"math\",\"verified\":false}},\"spec_version\":\"1.1\",\"verdict\":\"VERIFIED\"}"
    },
    "tricky": {
      "row": {
        "id": "84",
        "request_input": "Größe ≤ 5 — naïve 😀 \"quoted\" \\ tab\there",
        "verification_result": "{\"spec_version\": \"1.1\", \"object\": {\"formal_statement\": \"Gr\\u00f6\\u00dfe \\u2264 5 \\u2014 na\\u00efve \\ud83d\\ude00 \\\"quoted\\\" \\\\ tab\\there\", \"formalization\": {\"verified\": false, \"source_query\": \"Gr\\u00f6\\u00dfe \\u2264 5 \\u2014 na\\u00efve \\ud83d\\ude00 \\\"quoted\\\" \\\\ tab\\there\", \"translator\": \"custom-checker\"}}, \"context\": {\"interpretation\": {\"theory\": \"custom-checker verification\"}, \"proof\": {\"verifier\": \"custom-checker\", \"verifier_version\": \"1.2.3\", \"outcome_treatment\": \"unknown/timeout/error resolve to UNVERIFIABLE or BLOCKED\"}, \"evidence\": {\"evidence\": {\"status\": \"UNVERIFIABLE\", \"agent_message\": \"Built from a diagnostic the caller supplied; QWED did not produce its message or fields\", \"developer_fields\": {\"constraint_id\": \"verification_context.caller_supplied_diagnostic\", \"caller_supplied\": {\"agent_message\": \"\\u00dcn\\u00efc\\u00f6d\\u00e9 message \\u2014 \\u65e5\\u672c\\u8a9e \\ud83d\\ude00\\nsecond line\", \"developer_fields\": {\"floats\": [0.1, 0.30000000000000004, 1e-07, 123456789.125, -0.0, 5e-324, 1.5, 2.0], \"ints\": [0, -1, 123456789], \"keys\": {\"z\": 1, \"a\": 2, \"\\u00e9\": 3, \"\\uff61\": 4, \"\\ud83d\\ude00\": 5, \"A\": 6, \"\": 7, \"\\u007f\": 8}, \"controls\": \"\\u0001\\u001f\\u2028\\u2029\\b\\f\", \"nested\": {\"t\": true, \"f\": false, \"n\": null, \"empty\": {}, \"list\": []}}}}, \"proof_ref\": null, \"is_authoritative\": false}, \"proof_ref\": null}, \"decision\": {\"admission\": \"DENY\"}}, \"verdict\": \"UNVERIFIABLE\", \"attestation\": \"eyJhbGciOiJFUzI1NiIsImtpZCI6ImRpZDpxd2VkOm5vZGU6bG9jYWwjZ0lkblRNVV9PRnpQNnRfeFNtRFhibEdjeE1zTmtLUS10ZExjbWhnRWRaYyIsInR5cCI6InF3ZWQtY29udGV4dCtqd3QifQ.eyJpc3MiOiJkaWQ6cXdlZDpub2RlOmxvY2FsIiwic3ViIjoic2hhMjU2OmQ3YTA5ZTJhMzI4NzA3NDAwY2VlMDYyOTAyMzgyYWEyN2U5MDU0ZDg0ODlmYWMxYWI4MmYwZTllYjdmYWQ2ZjgiLCJpYXQiOjE3OTMwOTIyNTEsImV4cCI6MTc5MzE3ODY1MSwianRpIjoiYXR0X2UxYmIyNGI3OWRhNSIsInF3ZWQiOnsidmVyc2lvbiI6IjEuMSIsImRvY3VtZW50X2hhc2giOiJzaGEyNTY6ZDdhMDllMmEzMjg3MDc0MDBjZWUwNjI5MDIzODJhYTI3ZTkwNTRkODQ4OWZhYzFhYjgyZjBlOWViN2ZhZDZmOCIsInZlcmRpY3QiOiJVTlZFUklGSUFCTEUiLCJhZG1pc3Npb24iOiJERU5ZIiwicHJvb2ZfcmVmIjpudWxsfX0.GB74bCeg6qfUTkPCno4VgxbFRYuU2jw4ggZT-Iu9_u2RRnhDyiaRdwRaabLK-jGVM0S3vHNKSoBpIaninIRXwg\"}",
        "engine_used": "VERIFICATION_CONTEXT",
        "verdict": "UNVERIFIABLE",
        "status": "blocked",
        "admission": "DENY",
        "latency_ms": 0,
        "created_at": "2026-10-27T09:10:51.301452+00:00",
        "api_key_id": "1",
        "verifier_version": "8.0.0"
      },
      "signedHash": "sha256:d7a09e2a328707400cee062902382aa27e9054d8489fac1ab82f0e9eb7fad6f8",
      "storedHash": "sha256:d7a09e2a328707400cee062902382aa27e9054d8489fac1ab82f0e9eb7fad6f8",
      "storedCanonical": "{\"context\":{\"decision\":{\"admission\":\"DENY\"},\"evidence\":{\"evidence\":{\"agent_message\":\"Built from a diagnostic the caller supplied; QWED did not produce its message or fields\",\"developer_fields\":{\"caller_supplied\":{\"agent_message\":\"Ünïcödé message — 日本語 😀\\nsecond line\",\"developer_fields\":{\"controls\":\"\\u0001\\u001f  \\b\\f\",\"floats\":[0.1,0.30000000000000004,1e-7,123456789.125,0,5e-324,1.5,2],\"ints\":[0,-1,123456789],\"keys\":{\"\":7,\"A\":6,\"a\":2,\"z\":1,\"\":8,\"é\":3,\"😀\":5,\"｡\":4},\"nested\":{\"empty\":{},\"f\":false,\"list\":[],\"n\":null,\"t\":true}}},\"constraint_id\":\"verification_context.caller_supplied_diagnostic\"},\"is_authoritative\":false,\"proof_ref\":null,\"status\":\"UNVERIFIABLE\"},\"proof_ref\":null},\"interpretation\":{\"theory\":\"custom-checker verification\"},\"proof\":{\"outcome_treatment\":\"unknown/timeout/error resolve to UNVERIFIABLE or BLOCKED\",\"verifier\":\"custom-checker\",\"verifier_version\":\"1.2.3\"}},\"object\":{\"formal_statement\":\"Größe ≤ 5 — naïve 😀 \\\"quoted\\\" \\\\ tab\\there\",\"formalization\":{\"source_query\":\"Größe ≤ 5 — naïve 😀 \\\"quoted\\\" \\\\ tab\\there\",\"translator\":\"custom-checker\",\"verified\":false}},\"spec_version\":\"1.1\",\"verdict\":\"UNVERIFIABLE\"}"
    },
    "redacted": {
      "row": {
        "id": "85",
        "request_input": "Refund for [EMAIL_REDACTED] matches the returned items",
        "verification_result": "{\"spec_version\": \"1.1\", \"object\": {\"formal_statement\": \"Refund for [EMAIL_REDACTED] matches the returned items\", \"formalization\": {\"verified\": false, \"source_query\": \"Refund for [EMAIL_REDACTED] matches the returned items\", \"translator\": \"custom-checker\"}}, \"context\": {\"interpretation\": {\"theory\": \"custom-checker verification\"}, \"proof\": {\"verifier\": \"custom-checker\", \"verifier_version\": \"7.3.0\", \"outcome_treatment\": \"unknown/timeout/error resolve to UNVERIFIABLE or BLOCKED\"}, \"evidence\": {\"evidence\": {\"status\": \"UNVERIFIABLE\", \"agent_message\": \"Built from a diagnostic the caller supplied; QWED did not produce its message or fields\", \"developer_fields\": {\"constraint_id\": \"verification_context.caller_supplied_diagnostic\", \"caller_supplied\": {\"agent_message\": \"Write to [EMAIL_REDACTED] for the receipt.\", \"developer_fields\": {}}}, \"proof_ref\": null, \"is_authoritative\": false}, \"proof_ref\": null}, \"decision\": {\"admission\": \"DENY\"}}, \"verdict\": \"UNVERIFIABLE\", \"attestation\": \"eyJhbGciOiJFUzI1NiIsImtpZCI6ImRpZDpxd2VkOm5vZGU6bG9jYWwjZ0lkblRNVV9PRnpQNnRfeFNtRFhibEdjeE1zTmtLUS10ZExjbWhnRWRaYyIsInR5cCI6InF3ZWQtY29udGV4dCtqd3QifQ.eyJpc3MiOiJkaWQ6cXdlZDpub2RlOmxvY2FsIiwic3ViIjoic2hhMjU2OjQ5MDY2YWNkNGRhM2ExZDc5NmUyYTc0ZWNkZDU0YjBhYTc0MzY5NmQ2Zjg4ZDdkMzQ0MTM5MDBmM2Q0OWY1N2IiLCJpYXQiOjE3OTMwOTIyNTMsImV4cCI6MTc5MzE3ODY1MywianRpIjoiYXR0Xzc5MjAxNDEwNTg5YyIsInF3ZWQiOnsidmVyc2lvbiI6IjEuMSIsImRvY3VtZW50X2hhc2giOiJzaGEyNTY6NDkwNjZhY2Q0ZGEzYTFkNzk2ZTJhNzRlY2RkNTRiMGFhNzQzNjk2ZDZmODhkN2QzNDQxMzkwMGYzZDQ5ZjU3YiIsInZlcmRpY3QiOiJVTlZFUklGSUFCTEUiLCJhZG1pc3Npb24iOiJERU5ZIiwicHJvb2ZfcmVmIjpudWxsfX0.Ta6b7n5sFhpkD95zcmleKXH9A7GyJVmhgyr7kon_bc83Kjwc4vj8tM0X-vkkEOw1Q0eMLLOLnnhYSTdfGhZNZg\"}",
        "engine_used": "VERIFICATION_CONTEXT",
        "verdict": "UNVERIFIABLE",
        "status": "blocked",
        "admission": "DENY",
        "latency_ms": 0,
        "created_at": "2026-10-27T09:10:53.402695+00:00",
        "api_key_id": "1",
        "verifier_version": "8.0.0"
      },
      "signedHash": "sha256:49066acd4da3a1d796e2a74ecdd54b0aa743696d6f88d7d34413900f3d49f57b",
      "storedHash": "sha256:c6a77e1251ca601d7c17375ecf42a768e38910fe986a4defeb10c38dd53245c1",
      "storedCanonical": "{\"context\":{\"decision\":{\"admission\":\"DENY\"},\"evidence\":{\"evidence\":{\"agent_message\":\"Built from a diagnostic the caller supplied; QWED did not produce its message or fields\",\"developer_fields\":{\"caller_supplied\":{\"agent_message\":\"Write to [EMAIL_REDACTED] for the receipt.\",\"developer_fields\":{}},\"constraint_id\":\"verification_context.caller_supplied_diagnostic\"},\"is_authoritative\":false,\"proof_ref\":null,\"status\":\"UNVERIFIABLE\"},\"proof_ref\":null},\"interpretation\":{\"theory\":\"custom-checker verification\"},\"proof\":{\"outcome_treatment\":\"unknown/timeout/error resolve to UNVERIFIABLE or BLOCKED\",\"verifier\":\"custom-checker\",\"verifier_version\":\"7.3.0\"}},\"object\":{\"formal_statement\":\"Refund for [EMAIL_REDACTED] matches the returned items\",\"formalization\":{\"source_query\":\"Refund for [EMAIL_REDACTED] matches the returned items\",\"translator\":\"custom-checker\",\"verified\":false}},\"spec_version\":\"1.1\",\"verdict\":\"UNVERIFIABLE\"}"
    }
  }
};
