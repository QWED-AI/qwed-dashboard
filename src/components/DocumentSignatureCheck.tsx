import { useMutation } from '@tanstack/react-query';
import type { Jwks } from '../api/types';
import { useSession } from '../auth/session';
import { checkDocumentSignature, documentSignature, documentSignatureHeadline, SIGNED_SPEC_VERSION } from '../lib/documentSignature';
import type { LedgerRecord } from '../lib/result';
import { Icon } from './Icon';
import { KeysUnavailable, keysError, SignatureReport } from './SignatureReport';

/** Why a stored document has no signature to check. */
function unsignedText(specVersion: string | null): string {
  if (specVersion === '1.0') {
    return 'This is a spec 1.0 document, which carries no signature. qwed-verification signs the documents it issues from 8.0.0, as spec 1.1.';
  }
  if (specVersion === SIGNED_SPEC_VERSION) {
    return 'This spec 1.1 document carries no signature, though the spec requires one, so there is nothing to check.';
  }
  return `This document names spec version ${specVersion ?? 'none'}, which the dashboard does not check a signature for.`;
}

/**
 * Checks the signature a Verification Context document carries (spec 1.1,
 * #54) with the server's public keys (GET /.well-known/jwks.json), in the
 * browser, as any consumer of the document can.
 */
export function DocumentSignatureCheck({ record }: Readonly<{ record: LedgerRecord }>) {
  const { api } = useSession();
  const signature = documentSignature(record.result.value);
  const check = useMutation({
    mutationFn: async () => {
      if (signature.kind !== 'signed') throw new Error('This document carries no signature.');
      let jwks: Jwks;
      try {
        jwks = await api.getJwks();
      } catch (err) {
        throw keysError(err);
      }
      return checkDocumentSignature(signature.token, signature.document, jwks, Date.now() / 1000);
    },
  });

  const report = check.data;
  let label = 'Check signature';
  if (check.isPending) label = 'Checking…';
  else if (report) label = 'Check again';

  return (
    <section className="card" aria-labelledby="document-signature-title">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="shield" />
        <h2 id="document-signature-title">Document signature</h2>
      </div>

      {signature.kind === 'signed' ? (
        <>
          <button type="button" className="btn" onClick={() => check.mutate()} disabled={check.isPending}>
            {label}
          </button>
          <span className="hint">
            Checks the signature the server issued this document with against its public keys, in your browser. It
            shows the server issued the document as stored; it adds nothing to the verdict or the admission.
          </span>
        </>
      ) : (
        <p className="sub" style={{ margin: 0 }}>
          {unsignedText(signature.specVersion)}
        </p>
      )}

      {check.isError && (
        <p className="alert" role="alert">
          {check.error instanceof KeysUnavailable ? check.error.message : 'The signature could not be checked.'}
        </p>
      )}

      {report && <SignatureReport report={report} headline={documentSignatureHeadline(report)} />}
    </section>
  );
}
