const { Router } = require('express')
const memberController = require('./member.controller')
const validate = require('../../middlewares/validate.middleware')
const { authenticate, authorize } = require('../../middlewares/auth.middleware')
const {
  listMembersSchema,
  memberBreakdownSchema,
  memberOfferingsSchema,
  getMemberSchema,
  createMemberSchema,
  updateMemberSchema,
  bulkDeleteMembersSchema,
} = require('./member.validation')
const { idParamSchema } = require('../../shared/validators/common.validation')
const { ROLES } = require('../../config/constants')

const router = Router()

router.use(authenticate)

router.get('/config', memberController.getConfig)
router.get('/breakdown', validate(memberBreakdownSchema), memberController.getBreakdown)
router.get('/', validate(listMembersSchema), memberController.listMembers)
router.get('/:id', validate(getMemberSchema), memberController.getMember)
// Financial data, so it follows the same role gate as the transactions module.
router.get(
  '/:id/offerings',
  authorize(ROLES.FINANCE_ADMIN),
  validate(memberOfferingsSchema),
  memberController.getMemberOfferings,
)
router.post('/', validate(createMemberSchema), memberController.createMember)
router.post('/bulk-delete', validate(bulkDeleteMembersSchema), memberController.bulkDeleteMembers)
router.patch('/:id', validate(updateMemberSchema), memberController.updateMember)
router.delete('/:id', validate(idParamSchema), memberController.deleteMember)

module.exports = router
