const { PrismaClient } = require('@prisma/client')
const { NBC_TEACHER_GROUP_ROLE } = require('../src/modules/new-believers/new-believers.constants')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')

const prisma = new PrismaClient()

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
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

  const groupRoles = [
    'Choir',
    'Ushers',
    'Youth',
    'Elders',
    "Women's Ministry",
    NBC_TEACHER_GROUP_ROLE,
  ]
  const groups = {}
  for (const role of groupRoles) {
    const id = seedUuid(`group:${role}`)
    groups[role] = await prisma.group.upsert({
      where: { id },
      update: {},
      create: { id, role },
    })
  }

  const levelNames = ['Career', 'Young People', 'Men', 'Ladies', 'Young Ladies']
  const levels = {}
  for (const name of levelNames) {
    levels[name] = await prisma.level.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }

  const lighthouseGroupNames = ['Lighthouse 1', 'Lighthouse 2', 'Lighthouse 3']
  const lighthouseGroups = {}
  for (const name of lighthouseGroupNames) {
    lighthouseGroups[name] = await prisma.lighthouseGroup.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }

  const offeringTypeNames = [
    'Tithes',
    'Love',
    'Faith',
    'Christbirth',
    'Firstfruit',
    'Sacrificial',
    'Thanksgiving',
    'Bless Offering',
    "Children's Ministry",
    'Ensemble',
    'GCTV',
    'Mission',
    'Mercy',
    'Love Gift – Pastor',
  ]
  const offeringTypes = {}
  for (const name of offeringTypeNames) {
    offeringTypes[name] = await prisma.offeringType.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }

  return { statuses, types, categories, groups, levels, lighthouseGroups, offeringTypes }
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

function buildTransactionSeeds(members) {
  const incomeSeeds = [
    { category: 'Tithe', amounts: [2400, 1950, 3100, 2750, 2200, 2600, 1800, 3400, 2050, 2900] },
    { category: 'Offering', amounts: [950, 1200, 800, 1100, 675, 990, 1050, 725] },
  ]
  const expenseSeeds = [
    { category: 'Building Maintenance', amounts: [1800, 950, 1250, 700, 600] },
    { category: 'Utilities', amounts: [420, 380, 465, 410, 395, 440, 405] },
  ]

  const seeds = []
  let hoursAgoCreated = 5
  let memberIndex = 0

  for (const { category, amounts } of incomeSeeds) {
    for (const amount of amounts) {
      const member = members.length ? members[memberIndex % members.length] : null
      memberIndex += 1
      seeds.push({
        type: 'Income',
        category,
        amount: String(amount),
        description: `$${amount.toLocaleString()} received`,
        hoursAgoCreated,
        member,
      })
      hoursAgoCreated += 25
    }
  }

  for (const { category, amounts } of expenseSeeds) {
    for (const amount of amounts) {
      seeds.push({
        type: 'Expense',
        category,
        amount: String(amount),
        description: `${category} — $${amount.toLocaleString()}`,
        hoursAgoCreated,
        member: null,
      })
      hoursAgoCreated += 25
    }
  }

  return seeds
}

async function seedTransactions(admin, members, types, categories) {
  const transactionSeeds = buildTransactionSeeds(members)

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

async function seedOfferingBreakdownTransactions(admin, members, types, categories, offeringTypes) {
  const offeringAmounts = {
    Tithes: 2400,
    Love: 950,
    Faith: 800,
    Christbirth: 600,
    Firstfruit: 1100,
    Sacrificial: 750,
    Thanksgiving: 1300,
    'Bless Offering': 500,
    "Children's Ministry": 350,
    Ensemble: 275,
    GCTV: 425,
    Mission: 900,
    Mercy: 300,
    'Love Gift – Pastor': 650,
  }

  let hoursAgoCreated = 3
  let memberIndex = 0

  for (const [offeringTypeName, amount] of Object.entries(offeringAmounts)) {
    const createdAt = hoursAgo(hoursAgoCreated)
    const id = seedUuid(`transaction:offering:${offeringTypeName}`)
    const member = members.length ? members[memberIndex % members.length] : null
    memberIndex += 1

    await prisma.transaction.upsert({
      where: { id },
      update: {},
      create: {
        id,
        typeId: types['Income'].id,
        categoryId: categories['Offering'].id,
        amount: String(amount),
        description: `${offeringTypeName} offering`,
        memberId: member ? member.id : null,
        recordedBy: admin.id,
        createdAt,
        updatedAt: createdAt,
        items: {
          create: [
            {
              id: seedUuid(`transaction-item:${offeringTypeName}`),
              offeringTypeId: offeringTypes[offeringTypeName].id,
              amount: String(amount),
            },
          ],
        },
      },
    })

    await prisma.activityLog.upsert({
      where: { id: seedUuid(`activity:tx:offering:${offeringTypeName}`) },
      update: {},
      create: {
        id: seedUuid(`activity:tx:offering:${offeringTypeName}`),
        action: 'INCOME_RECORDED',
        message: `${offeringTypeName} offering recorded`,
        detail: `${offeringTypeName} offering`,
        actorId: admin.id,
        createdAt,
      },
    })

    hoursAgoCreated += 17
  }
}

// One member with a deep offering history so the member-detail offerings
// endpoint has enough data to exercise its period and offering-type filters.
// Only five of the offering types are used, so `types` in that response stays a
// visible subset of the full lookup list. Dates are relative to the seed run:
// the two most recent land in today/this week, the rest spread across the year.
// No activity logs here — 20 more entries would crowd out the dashboard feed.
const MEMBER_OFFERING_SEEDS = [
  { daysAgoCreated: 0, note: null, breakdown: [['Tithes', 1700]] },
  { daysAgoCreated: 0, note: 'Sunday service', breakdown: [['Thanksgiving', 900]] },
  { daysAgoCreated: 2, note: null, breakdown: [['Love', 600]] },
  { daysAgoCreated: 5, note: null, breakdown: [['Tithes', 1600]] },
  { daysAgoCreated: 9, note: null, breakdown: [['Sacrificial', 2000]] },
  { daysAgoCreated: 12, note: 'Annual', breakdown: [['Firstfruit', 900]] },
  { daysAgoCreated: 16, note: null, breakdown: [['Love', 500]] },
  { daysAgoCreated: 20, note: null, breakdown: [['Tithes', 1800]] },
  { daysAgoCreated: 24, note: null, breakdown: [['Thanksgiving', 1300]] },
  { daysAgoCreated: 28, note: null, breakdown: [['Sacrificial', 1700]] },
  {
    daysAgoCreated: 34,
    note: 'Split gift',
    breakdown: [
      ['Tithes', 1500],
      ['Love', 400],
    ],
  },
  { daysAgoCreated: 41, note: 'Annual', breakdown: [['Firstfruit', 500]] },
  { daysAgoCreated: 48, note: null, breakdown: [['Love', 550]] },
  { daysAgoCreated: 55, note: null, breakdown: [['Tithes', 1900]] },
  { daysAgoCreated: 63, note: null, breakdown: [['Thanksgiving', 800]] },
  { daysAgoCreated: 72, note: null, breakdown: [['Sacrificial', 1200]] },
  {
    daysAgoCreated: 85,
    note: 'Split gift',
    breakdown: [
      ['Tithes', 2100],
      ['Thanksgiving', 600],
    ],
  },
  { daysAgoCreated: 100, note: null, breakdown: [['Love', 450]] },
  { daysAgoCreated: 120, note: 'Annual', breakdown: [['Firstfruit', 1000]] },
  { daysAgoCreated: 150, note: null, breakdown: [['Tithes', 1750]] },
]

async function seedMemberOfferingHistory(admin, members, types, categories, offeringTypes) {
  const member = members.find((m) => m.firstName === 'Margaret')
  if (!member) return

  for (const [index, seed] of MEMBER_OFFERING_SEEDS.entries()) {
    const createdAt = daysAgo(seed.daysAgoCreated)
    const id = seedUuid(`transaction:member-offering:${member.id}:${index}`)
    const total = seed.breakdown.reduce((sum, [, amount]) => sum + amount, 0)

    await prisma.transaction.upsert({
      where: { id },
      update: {},
      create: {
        id,
        typeId: types['Income'].id,
        categoryId: categories['Offering'].id,
        amount: String(total),
        description: seed.note,
        memberId: member.id,
        recordedBy: admin.id,
        createdAt,
        updatedAt: createdAt,
        items: {
          create: seed.breakdown.map(([offeringTypeName, amount], itemIndex) => ({
            id: seedUuid(`transaction-item:member-offering:${member.id}:${index}:${itemIndex}`),
            offeringTypeId: offeringTypes[offeringTypeName].id,
            amount: String(amount),
          })),
        },
      },
    })
  }
}

async function seedMemberGroupAssignments(members, groups, levels, lighthouseGroups) {
  const margaret = members.find((m) => m.firstName === 'Margaret')
  const grace = members.find((m) => m.firstName === 'Grace')

  await prisma.member.update({
    where: { id: margaret.id },
    data: {
      groups: {
        connectOrCreate: [
          {
            where: { memberId_groupId: { memberId: margaret.id, groupId: groups['Choir'].id } },
            create: {
              groupId: groups['Choir'].id,
              levelId: levels['Ladies'].id,
              lighthouseGroupId: lighthouseGroups['Lighthouse 1'].id,
            },
          },
          {
            where: {
              memberId_groupId: {
                memberId: margaret.id,
                groupId: groups["Women's Ministry"].id,
              },
            },
            create: {
              groupId: groups["Women's Ministry"].id,
              levelId: levels['Ladies'].id,
              lighthouseGroupId: lighthouseGroups['Lighthouse 1'].id,
            },
          },
        ],
      },
    },
  })

  await prisma.member.update({
    where: { id: grace.id },
    data: {
      groups: {
        connectOrCreate: [
          {
            where: { memberId_groupId: { memberId: grace.id, groupId: groups['Ushers'].id } },
            create: {
              groupId: groups['Ushers'].id,
              levelId: levels['Young Ladies'].id,
              lighthouseGroupId: lighthouseGroups['Lighthouse 2'].id,
            },
          },
        ],
      },
    },
  })
}

async function seedAttendance(admin, members) {
  const margaret = members.find((m) => m.firstName === 'Margaret')
  const grace = members.find((m) => m.firstName === 'Grace')
  const david = members.find((m) => m.firstName === 'David')
  if (!margaret || !grace || !david) return

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const at = (hours, minutes) => {
    const d = new Date(today)
    d.setHours(hours, minutes, 0, 0)
    return d
  }

  const rows = [
    {
      member: margaret,
      morningIn: at(8, 2),
      morningOut: at(12, 15),
      afternoonIn: at(13, 30),
      afternoonOut: at(17, 0),
    },
    {
      member: grace,
      morningIn: at(8, 15),
      morningOut: at(12, 0),
      afternoonIn: null,
      afternoonOut: null,
    },
    {
      member: david,
      morningIn: null,
      morningOut: null,
      afternoonIn: null,
      afternoonOut: null,
    },
  ]

  for (const row of rows) {
    if (!row.morningIn && !row.afternoonIn) continue

    const id = seedUuid(`attendance:${row.member.id}:${today.toISOString().slice(0, 10)}`)
    await prisma.attendance.upsert({
      where: { memberId_date: { memberId: row.member.id, date: today } },
      update: {},
      create: {
        id,
        memberId: row.member.id,
        date: today,
        morningIn: row.morningIn,
        morningOut: row.morningOut,
        afternoonIn: row.afternoonIn,
        afternoonOut: row.afternoonOut,
        recordedBy: admin.id,
      },
    })
  }
}

async function seedNewBelieversClass(members, groups) {
  const lessons = [
    {
      sortOrder: 1,
      title: 'Assurance of Salvation',
      description:
        'Understanding the certainty of eternal life through faith in Christ.',
    },
    {
      sortOrder: 2,
      title: "The Bible — God's Word",
      description:
        'How Scripture was given, its authority, and how to read it daily.',
    },
    {
      sortOrder: 3,
      title: 'Prayer',
      description:
        'Communicating with God — adoration, confession, thanksgiving, and supplication.',
    },
    {
      sortOrder: 4,
      title: 'The Holy Spirit',
      description: "The person and work of the Holy Spirit in a believer's life.",
    },
    {
      sortOrder: 5,
      title: 'Water Baptism',
      description:
        'The meaning and importance of baptism as a public declaration of faith.',
    },
    {
      sortOrder: 6,
      title: "The Lord's Supper",
      description:
        'Understanding communion as a remembrance and proclamation of Christ.',
    },
    {
      sortOrder: 7,
      title: 'The Church & Fellowship',
      description:
        'Why belonging to a local church body matters for growth and accountability.',
    },
    {
      sortOrder: 8,
      title: 'Giving & Stewardship',
      description:
        "Biblical principles of tithing, offerings, and managing God's resources.",
    },
    {
      sortOrder: 9,
      title: 'Witnessing & Evangelism',
      description: 'How to share your testimony and the Gospel with confidence.',
    },
    {
      sortOrder: 10,
      title: 'Spiritual Warfare',
      description: 'Standing firm against the enemy.',
    },
    {
      sortOrder: 11,
      title: 'Discipleship',
      description: 'Growing and helping others grow in Christ.',
    },
    {
      sortOrder: 12,
      title: 'Living the Christian Life',
      description: 'Walking daily as a follower of Jesus.',
    },
  ]

  const lessonRows = {}
  for (const lesson of lessons) {
    const id = seedUuid(`nbc-lesson:${lesson.sortOrder}`)
    lessonRows[lesson.sortOrder] = await prisma.nbcLesson.upsert({
      where: { sortOrder: lesson.sortOrder },
      update: {
        title: lesson.title,
        description: lesson.description,
        isActive: true,
      },
      create: { id, ...lesson },
    })
  }

  const teacherGroup = groups[NBC_TEACHER_GROUP_ROLE]
  if (!teacherGroup || members.length < 4) return

  const teacherA = members[0]
  const teacherB = members[1]

  for (const teacher of [teacherA, teacherB]) {
    await prisma.memberGroup.upsert({
      where: {
        memberId_groupId: { memberId: teacher.id, groupId: teacherGroup.id },
      },
      update: {},
      create: { memberId: teacher.id, groupId: teacherGroup.id },
    })
  }

  const studentSpecs = [
    { member: members[2], teacher: teacherA, lesson: 4, status: 'ON_TRACK' },
    { member: members[3], teacher: teacherA, lesson: 7, status: 'ON_TRACK' },
    ...(members[4]
      ? [{ member: members[4], teacher: teacherA, lesson: 2, status: 'BEHIND' }]
      : []),
    ...(members[5]
      ? [{ member: members[5], teacher: teacherA, lesson: 9, status: 'ON_TRACK' }]
      : []),
    ...(members[6]
      ? [{ member: members[6], teacher: teacherB, lesson: 6, status: 'ON_TRACK' }]
      : []),
    ...(members[7]
      ? [{ member: members[7], teacher: teacherB, lesson: 3, status: 'BEHIND' }]
      : []),
    ...(members[8]
      ? [{ member: members[8], teacher: teacherB, lesson: 11, status: 'ADVANCED' }]
      : []),
  ]

  for (const spec of studentSpecs) {
    await prisma.member.update({
      where: { id: spec.member.id },
      data: { isNewBeliever: true },
    })

    const existing = await prisma.nbcEnrollment.findUnique({
      where: { studentId: spec.member.id },
    })
    if (existing) continue

    const enrollment = await prisma.nbcEnrollment.create({
      data: {
        studentId: spec.member.id,
        teacherId: spec.teacher.id,
        currentLessonId: lessonRows[spec.lesson].id,
        status: spec.status,
      },
    })

    await prisma.nbcLessonEvent.create({
      data: {
        enrollmentId: enrollment.id,
        toLessonId: lessonRows[spec.lesson].id,
        type: 'ENROLL',
      },
    })
  }
}

async function main() {
  const admin = await seedAdmin()
  const { statuses, types, categories, groups, levels, lighthouseGroups, offeringTypes } =
    await seedLookups()
  const members = await seedMembers(admin, statuses)
  await seedTransactions(admin, members, types, categories)
  await seedOfferingBreakdownTransactions(admin, members, types, categories, offeringTypes)
  await seedMemberOfferingHistory(admin, members, types, categories, offeringTypes)
  await seedMemberGroupAssignments(members, groups, levels, lighthouseGroups)
  await seedAttendance(admin, members)
  await seedNewBelieversClass(members, groups)

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
