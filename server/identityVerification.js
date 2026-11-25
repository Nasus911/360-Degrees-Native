const REVIEWABLE_STATUSES = new Set(['face_match_passed', 'submitted']);

function isVerificationObjectPath(path, userId, verificationId, prefix) {
  if (typeof path !== 'string') return false;
  const parts = path.split('/');
  return parts.length === 3
    && parts[0] === userId
    && parts[1] === verificationId
    && new RegExp(`^${prefix}-[a-z0-9-]+\\.(?:jpg|jpeg|png)$`, 'i').test(parts[2]);
}

function canReviewVerification(status) {
  return REVIEWABLE_STATUSES.has(status);
}

function canSubmitVerification(status) {
  return status === 'face_match_passed';
}

function mapProcessorErrorStatus(status) {
  return status === 401 ? 502 : status;
}

function validateReviewedFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
  const fullName = typeof fields.full_name === 'string' ? fields.full_name.trim() : '';
  const dateOfBirth = typeof fields.date_of_birth === 'string' ? fields.date_of_birth.trim() : '';
  const address = typeof fields.address === 'string' ? fields.address.trim() : '';
  const idNumber = typeof fields.id_number === 'string' ? fields.id_number.replace(/\D/g, '') : '';

  if (!fullName || fullName.length > 160) return null;
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!dateParts) return null;
  const parsedDate = new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3])));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (parsedDate.toISOString().slice(0, 10) !== dateOfBirth || parsedDate > today) return null;
  if (!address || address.length > 300) return null;
  if (!/^\d{12,16}$/.test(idNumber)) return null;

  return {
    full_name: fullName,
    date_of_birth: dateOfBirth,
    address,
    id_number: idNumber,
    expiration_date: null,
  };
}

function publicVerification(row) {
  const canReview = canReviewVerification(row.status);
  return {
    id: row.id,
    documentType: row.document_type,
    status: row.status,
    consentVersion: row.consent_version,
    createdAt: row.created_at,
    scanIssues: row.scan_issues || [],
    matchIssues: row.match_issues || [],
    cleanupPending: Boolean(row.cleanup_pending),
    fields: canReview ? row.reviewed_fields || row.extracted_fields : null,
  };
}

module.exports = {
  canReviewVerification,
  canSubmitVerification,
  isVerificationObjectPath,
  mapProcessorErrorStatus,
  publicVerification,
  validateReviewedFields,
};
