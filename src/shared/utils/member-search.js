function memberSearchTokens(search) {
  return String(search || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/** Prisma where: each word must match email or any name part. */
function buildMemberNameSearchWhere(search) {
  const tokens = memberSearchTokens(search)
  if (tokens.length === 0) return null

  const tokenClause = (token) => ({
    OR: [
      { email: { contains: token, mode: 'insensitive' } },
      { firstName: { contains: token, mode: 'insensitive' } },
      { middleName: { contains: token, mode: 'insensitive' } },
      { lastName: { contains: token, mode: 'insensitive' } },
    ],
  })

  if (tokens.length === 1) return tokenClause(tokens[0])

  return { AND: tokens.map(tokenClause) }
}

module.exports = { memberSearchTokens, buildMemberNameSearchWhere }
