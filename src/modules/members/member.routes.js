const { Router } = require('express')
const memberController = require('./member.controller')
const validate = require('../../middlewares/validate.middleware')
const { authenticate } = require('../../middlewares/auth.middleware')
const { listMembersSchema } = require('./member.validation')
const { idParamSchema } = require('../../shared/validators/common.validation')

const router = Router()

router.use(authenticate)

router.get('/', validate(listMembersSchema), memberController.listMembers)
router.get('/:id', validate(idParamSchema), memberController.getMember)

module.exports = router
