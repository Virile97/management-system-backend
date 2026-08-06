const { Router } = require('express')
const memberController = require('./member.controller')
const validate = require('../../middlewares/validate.middleware')
const { authenticate } = require('../../middlewares/auth.middleware')
const { listMembersSchema, createMemberSchema, updateMemberSchema } = require('./member.validation')
const { idParamSchema } = require('../../shared/validators/common.validation')

const router = Router()

router.use(authenticate)

router.get('/config', memberController.getConfig)
router.get('/', validate(listMembersSchema), memberController.listMembers)
router.get('/:id', validate(idParamSchema), memberController.getMember)
router.post('/', validate(createMemberSchema), memberController.createMember)
router.patch('/:id', validate(updateMemberSchema), memberController.updateMember)
router.delete('/:id', validate(idParamSchema), memberController.deleteMember)

module.exports = router
