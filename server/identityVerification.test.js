const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canReviewVerification,
  canSubmitVerification,
  isVerificationObjectPath,
  publicVerification,
  validateReviewedFields,
} = require('./identityVerification');

test('personal fields stay hidden until face matching passes', () => {
  const row = {
    id: 'verification-1',
    status: 'id_scan_passed',
    extracted_fields: { full_name: 'Sample Person' },
  };
  assert.equal(publicVerification(row).fields, null);
  assert.equal(publicVerification({ ...row, status: 'face_match_passed' }).fields.full_name, 'Sample Person');
  assert.equal(canReviewVerification('submitted'), true);
});

test('submission is blocked until both verification checks pass', () => {
  assert.equal(canSubmitVerification('awaiting_id'), false);
  assert.equal(canSubmitVerification('id_scan_passed'), false);
  assert.equal(canSubmitVerification('face_match_failed'), false);
  assert.equal(canSubmitVerification('face_match_passed'), true);
  assert.equal(canSubmitVerification('submitted'), false);
});

test('storage paths are scoped to the current user and verification', () => {
  assert.equal(
    isVerificationObjectPath('user-1/verify-1/id-a123.jpg', 'user-1', 'verify-1', 'id'),
    true,
  );
  assert.equal(
    isVerificationObjectPath('user-2/verify-1/id-a123.jpg', 'user-1', 'verify-1', 'id'),
    false,
  );
  assert.equal(
    isVerificationObjectPath('user-1/verify-2/../id.jpg', 'user-1', 'verify-1', 'id'),
    false,
  );
});

test('review fields are validated and national-ID expiration remains not applicable', () => {
  const fields = validateReviewedFields({
    full_name: 'Sample Person',
    date_of_birth: '2000-01-02',
    address: 'Sample Street, Lipa City',
    id_number: '1234-5678-9012-3456',
    expiration_date: '2099-01-01',
  });
  assert.equal(fields.id_number, '1234567890123456');
  assert.equal(fields.expiration_date, null);
  assert.equal(validateReviewedFields({ full_name: 'Incomplete' }), null);
  assert.equal(validateReviewedFields({
    full_name: 'Sample Person',
    date_of_birth: '2000-02-31',
    address: 'Sample Street, Lipa City',
    id_number: '1234567890123456',
  }), null);
  assert.equal(validateReviewedFields({
    full_name: 'Sample Person',
    date_of_birth: '2999-01-01',
    address: 'Sample Street, Lipa City',
    id_number: '1234567890123456',
  }), null);
});
