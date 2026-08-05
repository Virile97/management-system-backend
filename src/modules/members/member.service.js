const memberRepository = require('./member.repository')
const { AppError } = require('../../shared/errors')
const { getPagination, buildMeta } = require('../../shared/utils')

async function listMembers(query) {
  const { page, limit, skip } = getPagination(query)
  const { search, status } = query

  const [members, total] = await Promise.all([
    memberRepository.findMany({ skip, limit, search, status }),
    memberRepository.count({ search, status }),
  ])

  return {
    items: members,
    meta: buildMeta({ page, limit, total }),
  }
}

async function getMemberById(id) {
  const member = await memberRepository.findById(id)
  if (!member) {
    throw AppError.notFound('Member not found')
  }
  return member
}

module.exports = { listMembers, getMemberById }
