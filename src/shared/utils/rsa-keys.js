const crypto = require('crypto')

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

function decryptWithPrivateKey(base64Ciphertext) {
  return crypto
    .privateDecrypt(
      { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(base64Ciphertext, 'base64'),
    )
    .toString('utf8')
}

module.exports = { publicKey, decryptWithPrivateKey }
