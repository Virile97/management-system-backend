const { EventEmitter } = require('events')

const emitter = new EventEmitter()
emitter.setMaxListeners(0)

function emitThumbnailStatus(fileId, status) {
  emitter.emit(`thumbnail:${fileId}`, status)
}

function onThumbnailStatus(fileId, listener) {
  const event = `thumbnail:${fileId}`
  emitter.on(event, listener)

  return () => emitter.off(event, listener)
}

module.exports = { emitThumbnailStatus, onThumbnailStatus }
