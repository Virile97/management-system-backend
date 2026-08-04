const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
  test: {
    setupFiles: ['./tests/setup-env.js'],
  },
})
