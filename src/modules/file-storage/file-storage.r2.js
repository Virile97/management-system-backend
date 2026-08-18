const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const r2 = require('../../config/r2')
const { SIGNED_URL_EXPIRY_SECONDS } = require('./file-storage.constants')

function objectLocation(bucket, key) {
  return { Bucket: bucket, Key: key }
}

async function uploadObject(bucket, key, buffer, contentType) {
  await r2.send(
    new PutObjectCommand({
      ...objectLocation(bucket, key),
      Body: buffer,
      ContentType: contentType,
    }),
  )
}

async function downloadObject(bucket, key) {
  const result = await r2.send(new GetObjectCommand(objectLocation(bucket, key)))
  const chunks = []
  for await (const chunk of result.Body) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function getSignedObjectUrl(bucket, key, { downloadFilename } = {}) {
  const command = new GetObjectCommand({
    ...objectLocation(bucket, key),
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
