import { randomBytes } from 'node:crypto';
import { extname } from 'node:path';

export const ALLOWED_UPLOADS = Object.freeze({
  'application/pdf': ['.pdf'], 'text/csv': ['.csv'],
  'application/vnd.ms-excel': ['.xls'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/msword': ['.doc'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp']
});
export function validateUpload({ fileName, mimeType, byteSize }, maxBytes = 10 * 1024 * 1024) {
  const cleanName = String(fileName || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 240), type = String(mimeType || '').toLowerCase(), size = Number(byteSize);
  if (!cleanName || cleanName.includes('/') || cleanName.includes('\\')) throw new Error('File name is invalid.');
  if (!Number.isInteger(size) || size < 1 || size > maxBytes) throw new Error(`File size must be between 1 byte and ${maxBytes} bytes.`);
  const extension = extname(cleanName).toLowerCase();
  if (!ALLOWED_UPLOADS[type]?.includes(extension)) throw new Error('File type and extension are not supported.');
  return { fileName: cleanName, mimeType: type, byteSize: size, extension };
}
export const storageKey = (organizationId, extension, kind = 'attachments') => `${organizationId}/${kind}/${new Date().toISOString().slice(0, 10)}/${randomBytes(24).toString('hex')}${extension}`;
export function validateMagic(bytes, mimeType) {
  const buffer = Buffer.from(bytes), hex = buffer.subarray(0, 12).toString('hex');
  const signatures = { 'application/pdf': ['25504446'], 'image/png': ['89504e470d0a1a0a'], 'image/jpeg': ['ffd8ff'], 'image/webp': ['52494646'], 'application/vnd.ms-excel': ['d0cf11e0'], 'application/msword': ['d0cf11e0'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['504b0304'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['504b0304'] };
  if (mimeType === 'text/csv') { if (buffer.includes(0)) throw new Error('CSV content is not valid text.'); return true; }
  if (!signatures[mimeType]?.some(prefix => hex.startsWith(prefix))) throw new Error('Uploaded content does not match the declared file type.');
  if (mimeType === 'image/webp' && buffer.subarray(8, 12).toString() !== 'WEBP') throw new Error('Uploaded content is not a valid WebP image.');
  return true;
}

export class S3StorageProvider {
  constructor(config) { this.config = config; this.clientPromise = null; }
  async clients() { if (!this.config?.bucket) throw new Error('Object storage is not configured.'); if (!this.clientPromise) this.clientPromise = Promise.all([import('@aws-sdk/client-s3'), import('@aws-sdk/s3-request-presigner')]).then(([s3, signer]) => ({ s3, signer, client: new s3.S3Client({ region: this.config.region, endpoint: this.config.endpoint || undefined, forcePathStyle: Boolean(this.config.forcePathStyle), credentials: this.config.accessKeyId ? { accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey } : undefined }) })); return this.clientPromise; }
  async createUploadUrl({ key, mimeType, byteSize }) { const { s3, signer, client } = await this.clients(); const command = new s3.PutObjectCommand({ Bucket: this.config.bucket, Key: key, ContentType: mimeType, ContentLength: byteSize, Metadata: { scan: 'pending' } }); return signer.getSignedUrl(client, command, { expiresIn: 900 }); }
  async verify({ key, storageKey, byteSize, mimeType }) { const objectKey = key || storageKey; if (!objectKey) throw new Error('Private upload storage key is missing.'); const { s3, client } = await this.clients(); const result = await client.send(new s3.HeadObjectCommand({ Bucket: this.config.bucket, Key: objectKey })); if (Number(result.ContentLength) !== byteSize) throw new Error('Uploaded object size does not match its reservation.'); if (result.ContentType !== mimeType) throw new Error('Uploaded object type does not match its reservation.'); const sample = await client.send(new s3.GetObjectCommand({ Bucket: this.config.bucket, Key: objectKey, Range: 'bytes=0-31' })); validateMagic(await sample.Body.transformToByteArray(), mimeType); return { etag: result.ETag || '', contentType: result.ContentType || '' }; }
  async createDownloadUrl(key) { const { s3, signer, client } = await this.clients(); return signer.getSignedUrl(client, new s3.GetObjectCommand({ Bucket: this.config.bucket, Key: key }), { expiresIn: 300 }); }
  async get(key) { const { s3, client } = await this.clients(); const response = await client.send(new s3.GetObjectCommand({ Bucket: this.config.bucket, Key: key })); return Buffer.from(await response.Body.transformToByteArray()); }
  async put({ key, body, mimeType }) { const { s3, client } = await this.clients(); return client.send(new s3.PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentType: mimeType, Metadata: { scan: 'generated' } })); }
  async delete(key) { const { s3, client } = await this.clients(); await client.send(new s3.DeleteObjectCommand({ Bucket: this.config.bucket, Key: key })); }
}
