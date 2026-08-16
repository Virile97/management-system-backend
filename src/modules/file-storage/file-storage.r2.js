const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const r2 = require('../../config/r2')
const { SIGNED_URL_EXPIRY_SECONDS } = require('./file-storage.constants')

/** Thin wrapper around the R2 (S3-compatible) client, scoped to what File
 * Storage needs — upload/download/sign/remove — mirroring the small surface
 * `supabase.storage.from(bucket)` used to expose, so the service/thumbnail
 * modules don't need to know S3 SDK details directly. */

async function uploadObject(bucket, key, buffer, contentType) {
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  )
}

async function downloadObject(bucket, key) {
  const result = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const chunks = []
  for await (const chunk of result.Body) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** `downloadFilename` set forces Content-Disposition: attachment on the
 * signed URL, same as Supabase's old `{ download: filename }` option —
 * required for real "download this file" actions; omit for inline
 * rendering (thumbnails, previews, viewer embeds). */
async function getSignedObjectUrl(bucket, key, { downloadFilename } = {}) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(downloadFilename
      ? { ResponseContentDisposition: `attachment; filename="${downloadFilename}"` }
      : {}),
  })
  return getSignedUrl(r2, command, { expiresIn: SIGNED_URL_EXPIRY_SECONDS })
}

async function removeObjects(bucket, keys) {
  if (!keys.length) return
  await r2.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    }),
  )
}

module.exports = {
  uploadObject,
  downloadObject,
  getSignedObjectUrl,
  removeObjects,
}
