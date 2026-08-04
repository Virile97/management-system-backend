const { Router } = require('express')
const postController = require('./post.controller')
const validate = require('../../middlewares/validate.middleware')
const { authenticate } = require('../../middlewares/auth.middleware')
const { createPostSchema, updatePostSchema, listPostsSchema } = require('./post.validation')
const { idParamSchema } = require('../../shared/validators/common.validation')

const router = Router()

router.get('/', validate(listPostsSchema), postController.listPosts)
router.get('/:id', validate(idParamSchema), postController.getPost)

router.use(authenticate)

router.post('/', validate(createPostSchema), postController.createPost)
router.patch('/:id', validate(updatePostSchema), postController.updatePost)
router.delete('/:id', validate(idParamSchema), postController.deletePost)

module.exports = router
