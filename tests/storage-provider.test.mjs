import test from 'node:test';
import assert from 'node:assert/strict';
import { S3StorageProvider, storageKey, validateMagic, validateUpload } from '../lib/storage-provider.mjs';

test('upload reservations reject traversal, extension spoofing and invalid sizes', () => {
  assert.deepEqual(validateUpload({ fileName: 'request.pdf', mimeType: 'application/pdf', byteSize: 123 }), { fileName: 'request.pdf', mimeType: 'application/pdf', byteSize: 123, extension: '.pdf' });
  assert.throws(() => validateUpload({ fileName: '../request.pdf', mimeType: 'application/pdf', byteSize: 123 }), /invalid/);
  assert.throws(() => validateUpload({ fileName: 'request.exe', mimeType: 'application/pdf', byteSize: 123 }), /not supported/);
  assert.throws(() => validateUpload({ fileName: 'request.pdf', mimeType: 'application/pdf', byteSize: 0 }), /File size/);
  assert.throws(() => validateUpload({ fileName: 'request.pdf', mimeType: 'application/pdf', byteSize: 200 }, 100), /File size/);
});

test('content signatures are checked independently from browser MIME claims', () => {
  assert.equal(validateMagic(Buffer.from('%PDF-1.7\n'), 'application/pdf'), true);
  assert.equal(validateMagic(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), 'image/png'), true);
  assert.throws(() => validateMagic(Buffer.from('malicious'), 'application/pdf'), /does not match/);
  assert.throws(() => validateMagic(Buffer.from([0,1,2]), 'text/csv'), /not valid text/);
  const key = storageKey('org_123', '.pdf');
  assert.match(key, /^org_123\/attachments\/\d{4}-\d{2}-\d{2}\/[a-f0-9]{48}\.pdf$/);
  assert.equal(key.includes('..'), false);
});

test('S3 completion uses persisted attachment storageKey instead of an undefined key', async () => {
  const keys = [];
  class HeadObjectCommand { constructor(input) { this.input = input; } }
  class GetObjectCommand { constructor(input) { this.input = input; } }
  const provider = new S3StorageProvider({ bucket: 'private-bucket' });
  provider.clients = async () => ({
    s3: { HeadObjectCommand, GetObjectCommand },
    client: { send: async cmd => {
      keys.push(cmd.input.Key);
      return cmd instanceof HeadObjectCommand
        ? { ContentLength: 123, ContentType: 'application/pdf', ETag: 'etag' }
        : { Body: { transformToByteArray: async () => Buffer.from('%PDF-1.7') } };
    } }
  });
  const result = await provider.verify({ storageKey: 'org/attachments/request.pdf', byteSize: 123, mimeType: 'application/pdf' });
  assert.deepEqual(keys, ['org/attachments/request.pdf', 'org/attachments/request.pdf']);
  assert.equal(result.etag, 'etag');
  await assert.rejects(() => provider.verify({ byteSize: 123, mimeType: 'application/pdf' }), /storage key is missing/);
});
