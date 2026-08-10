const { Router } = require('express')
const memberController = require('./member.controller')
const validate = require('../../middlewares/validate.middleware')
const { authenticate } = require('../../middlewares/auth.middleware')
const {
  listMembersSchema,
  memberBreakdownSchema,
  createMemberSchema,
  updateMemberSchema,
  bulkDeleteMembersSchema,
} = require('./member.validation')
const { idParamSchema } = require('../../shared/validators/common.validation')

const router = Router()

router.use(authenticate)

router.get('/config', memberController.getConfig)
router.get('/breakdown', validate(memberBreakdownSchema), memberController.getBreakdown)
router.get('/', validate(listMembersSchema), memberController.listMembers)
router.get('/:id', validate(idParamSchema), memberController.getMember)
router.post('/', validate(createMemberSchema), memberController.createMember)
router.post('/bulk-delete', validate(bulkDeleteMembersSchema), memberController.bulkDeleteMembers)
router.patch('/:id', validate(updateMemberSchema), memberController.updateMember)
router.delete('/:id', validate(idParamSchema), memberController.deleteMember)

module.exports = router
