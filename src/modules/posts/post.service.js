const postRepository = require('./post.repository')
const { AppError } = require('../../shared/errors')
const { getPagination, buildMeta } = require('../../shared/utils')

async function listPosts(query) {
  const { page, limit, skip } = getPagination(query)
  const where =
    query.published !== undefined ? { published: query.published === 'true' } : undefined

  const [posts, total] = await Promise.all([
    postRepository.findMany({ skip, limit, where }),
    postRepository.count(where),
  ])

  return { items: posts, meta: buildMeta({ page, limit, total }) }
}

async function getPostById(id) {
  const post = await postRepository.findById(id)
  if (!post) {
    throw AppError.notFound('Post not found')
  }
  return post
}

async function createPost(authorId, data) {
  return postRepository.create({ ...data, authorId })
}

async function updatePost(id, authorId, data) {
  const post = await postRepository.findById(id)
  if (!post) {
    throw AppError.notFound('Post not found')
  }
  if (post.authorId !== authorId) {
    throw AppError.forbidden('You do not have permission to edit this post')
  }

  return postRepository.updateById(id, data)
}

async function deletePost(id, authorId) {
  const post = await postRepository.findById(id)
  if (!post) {
    throw AppError.notFound('Post not found')
  }
  if (post.authorId !== authorId) {
    throw AppError.forbidden('You do not have permission to delete this post')
  }

  await postRepository.deleteById(id)
}

module.exports = { listPosts, getPostById, createPost, updatePost, deletePost }
