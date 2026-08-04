const postService = require('./post.service')
const { asyncHandler, ApiResponse } = require('../../shared/utils')

const listPosts = asyncHandler(async (req, res) => {
  const { items, meta } = await postService.listPosts(req.query)
  return ApiResponse.success(res, items, 'Posts retrieved successfully', 200, meta)
})

const getPost = asyncHandler(async (req, res) => {
  const post = await postService.getPostById(req.params.id)
  return ApiResponse.success(res, post, 'Post retrieved successfully')
})

const createPost = asyncHandler(async (req, res) => {
  const post = await postService.createPost(req.user.id, req.body)
  return ApiResponse.created(res, post, 'Post created successfully')
})

const updatePost = asyncHandler(async (req, res) => {
  const post = await postService.updatePost(req.params.id, req.user.id, req.body)
  return ApiResponse.success(res, post, 'Post updated successfully')
})

const deletePost = asyncHandler(async (req, res) => {
  await postService.deletePost(req.params.id, req.user.id)
  return ApiResponse.noContent(res)
})

module.exports = { listPosts, getPost, createPost, updatePost, deletePost }
