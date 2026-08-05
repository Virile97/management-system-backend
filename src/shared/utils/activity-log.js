const prisma = require('../../config/prisma')

function logActivity({ action, message, detail, metadata, actorId }) {
  return prisma.activityLog.create({
    data: { action, message, detail, metadata, actorId },
  })
}

module.exports = { logActivity }
