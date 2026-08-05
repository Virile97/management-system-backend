const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')

const prisma = new PrismaClient()

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}

// Deterministic UUID derived from a stable seed key, so re-running the seed
// upserts the same rows instead of creating duplicates or using non-UUID ids.
function seedUuid(key) {
  const hash = crypto.createHash('sha256').update(key).digest('hex')
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-')
}

async function seedAdmin() {
  const passwordHash = await bcrypt.hash('Password123!', 10)

  return prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: passwordHash,
      name: 'Admin User',
      role: 'ADMIN',
    },
  })
}

async function seedLookups() {
  const statusNames = ['Active', 'Inactive', 'Deceased']
  const statuses = {}
  for (const name of statusNames) {
    statuses[name] = await prisma.status.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }

  const typeNames = ['Income', 'Expense']
  const types = {}
  for (const name of typeNames) {
    types[name] = await prisma.transactionType.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }

  const categoryNames = ['Tithe', 'Offering', 'Building Maintenance', 'Utilities']
  const categories = {}
  for (const name of categoryNames) {
    categories[name] = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }

  return { statuses, types, categories }
}

async function seedMembers(admin, statuses) {
  const memberSeeds = [
    { firstName: 'Margaret', lastName: 'Osei', status: 'Active', hoursAgoCreated: 2 },
    { firstName: 'Grace', lastName: 'Mensah', status: 'Active', hoursAgoCreated: 48 },
    { firstName: 'David', lastName: 'Asante', status: 'Inactive', hoursAgoCreated: 26 },
    { firstName: 'Samuel', lastName: 'Boateng', status: 'Active', hoursAgoCreated: 72 },
    { firstName: 'Comfort', lastName: 'Owusu', status: 'Active', hoursAgoCreated: 96 },
    { firstName: 'Kwame', lastName: 'Adjei', status: 'Inactive', hoursAgoCreated: 120 },
    { firstName: 'Abena', lastName: 'Frimpong', status: 'Active', hoursAgoCreated: 150 },
    { firstName: 'Yaw', lastName: 'Nkrumah', status: 'Deceased', hoursAgoCreated: 300 },
    { firstName: 'Efua', lastName: 'Amoah', status: 'Active', hoursAgoCreated: 175 },
    { firstName: 'Kofi', lastName: 'Appiah', status: 'Active', hoursAgoCreated: 190 },
    { firstName: 'Akosua', lastName: 'Darko', status: 'Inactive', hoursAgoCreated: 205 },
    { firstName: 'Kwabena', lastName: 'Antwi', status: 'Active', hoursAgoCreated: 220 },
    { firstName: 'Adwoa', lastName: 'Yeboah', status: 'Active', hoursAgoCreated: 235 },
    { firstName: 'Kojo', lastName: 'Sarpong', status: 'Active', hoursAgoCreated: 250 },
    { firstName: 'Akua', lastName: 'Gyasi', status: 'Inactive', hoursAgoCreated: 265 },
    { firstName: 'Yaa', lastName: 'Ankrah', status: 'Active', hoursAgoCreated: 280 },
    { firstName: 'Kwesi', lastName: 'Baah', status: 'Active', hoursAgoCreated: 320 },
    { firstName: 'Esi', lastName: 'Danso', status: 'Active', hoursAgoCreated: 340 },
    { firstName: 'Kwaku', lastName: 'Ofori', status: 'Deceased', hoursAgoCreated: 360 },
    { firstName: 'Ama', lastName: 'Kusi', status: 'Active', hoursAgoCreated: 380 },
    { firstName: 'Nana', lastName: 'Agyeman', status: 'Active', hoursAgoCreated: 400 },
    { firstName: 'Adjoa', lastName: 'Bonsu', status: 'Inactive', hoursAgoCreated: 420 },
    { firstName: 'Kwadwo', lastName: 'Twum', status: 'Active', hoursAgoCreated: 440 },
    { firstName: 'Abla', lastName: 'Quaye', status: 'Active', hoursAgoCreated: 460 },
    { firstName: 'Fiifi', lastName: 'Arthur', status: 'Active', hoursAgoCreated: 480 },
    { firstName: 'Baaba', lastName: 'Essien', status: 'Active', hoursAgoCreated: 500 },
    { firstName: 'Kwame', lastName: 'Nyarko', status: 'Inactive', hoursAgoCreated: 520 },
    { firstName: 'Afia', lastName: 'Tetteh', status: 'Active', hoursAgoCreated: 540 },
    { firstName: 'Yaw', lastName: 'Acheampong', status: 'Active', hoursAgoCreated: 560 },
    { firstName: 'Serwaa', lastName: 'Opoku', status: 'Active', hoursAgoCreated: 580 },
    { firstName: 'Kobina', lastName: 'Mensa', status: 'Deceased', hoursAgoCreated: 600 },
  ]

  const members = []
  for (const seed of memberSeeds) {
    const createdAt = hoursAgo(seed.hoursAgoCreated)
    const memberId = seedUuid(`member:${seed.firstName}:${seed.lastName}`)

    const member = await prisma.member.upsert({
      where: { id: memberId },
      update: {},
      create: {
        id: memberId,
        firstName: seed.firstName,
        lastName: seed.lastName,
        statusId: statuses[seed.status].id,
        addedBy: admin.id,
        joinedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      },
    })

    members.push(member)

    await prisma.activityLog.upsert({
      where: { id: seedUuid(`activity:member:${member.id}`) },
      update: {},
      create: {
        id: seedUuid(`activity:member:${member.id}`),
        action: 'MEMBER_REGISTERED',
        message: 'New member registered',
        detail: `${member.firstName} ${member.lastName}`,
        actorId: admin.id,
        createdAt,
      },
    })
  }

  // David Asante's status was later changed to Inactive — log it as its own event.
  const david = members.find((m) => m.firstName === 'David')
  await prisma.activityLog.upsert({
    where: { id: seedUuid(`activity:status:${david.id}`) },
    update: {},
    create: {
      id: seedUuid(`activity:status:${david.id}`),
      action: 'MEMBER_STATUS_CHANGED',
      message: 'Status updated to Inactive',
      detail: `${david.firstName} ${david.lastName}`,
      metadata: { from: 'Active', to: 'Inactive' },
      actorId: admin.id,
      createdAt: hoursAgo(26),
    },
  })

  return members
}

async function seedTransactions(admin, members, types, categories) {
  const transactionSeeds = [
    {
      type: 'Income',
      category: 'Tithe',
      amount: '2400',
      description: '$2,400 received',
      hoursAgoCreated: 5,
      member: members[0],
    },
    {
      type: 'Expense',
      category: 'Building Maintenance',
      amount: '1800',
      description: 'Building maintenance — $1,800',
      hoursAgoCreated: 30,
      member: null,
    },
    {
      type: 'Income',
      category: 'Offering',
      amount: '950',
      description: '$950 received',
      hoursAgoCreated: 55,
      member: members[1],
    },
    {
      type: 'Expense',
      category: 'Utilities',
      amount: '420',
      description: 'Utilities — $420',
      hoursAgoCreated: 80,
      member: null,
    },
  ]

  for (const seed of transactionSeeds) {
    const createdAt = hoursAgo(seed.hoursAgoCreated)
    const id = seedUuid(`transaction:${seed.type}:${seed.hoursAgoCreated}`)

    await prisma.transaction.upsert({
      where: { id },
      update: {},
      create: {
        id,
        typeId: types[seed.type].id,
        categoryId: categories[seed.category].id,
        amount: seed.amount,
        description: seed.description,
        memberId: seed.member ? seed.member.id : null,
        recordedBy: admin.id,
        createdAt,
        updatedAt: createdAt,
      },
    })

    await prisma.activityLog.upsert({
      where: { id: seedUuid(`activity:tx:${id}`) },
      update: {},
      create: {
        id: seedUuid(`activity:tx:${id}`),
        action: seed.type === 'Income' ? 'INCOME_RECORDED' : 'EXPENSE_RECORDED',
        message: seed.type === 'Income' ? `${seed.category} recorded` : 'Expense logged',
        detail: seed.description,
        actorId: admin.id,
        createdAt,
      },
    })
  }
}

async function main() {
  const admin = await seedAdmin()
  const { statuses, types, categories } = await seedLookups()
  const members = await seedMembers(admin, statuses)
  await seedTransactions(admin, members, types, categories)

  console.log('Seed complete.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
