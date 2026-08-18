const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const cookieParser = require('cookie-parser')

const env = require('./config/env')
const routes = require('./routes')
const requestLogger = require('./middlewares/request-logger.middleware')
const rateLimitMiddleware = require('./middlewares/rate-limit.middleware')
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware')

const app = express()

const allowedOrigins = [env.FRONTEND_URL]

app.use(helmet())
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      return callback(new Error('The CORS policy does not allow access from the specified Origin.'))
    },
    credentials: true,
  }),
)
// Skip compression for SSE (text/event-stream) — compression buffers the
// response until it has enough data to flush a chunk, which defeats
// streaming and can stall the connection indefinitely.
app.use(
  compression({
    filter: (req, res) => {
      if (res.getHeader('Content-Type') === 'text/event-stream') return false
      return compression.filter(req, res)
    },
  }),
)
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(requestLogger)
app.use(rateLimitMiddleware)

app.use(env.API_PREFIX, routes)

app.use(notFoundHandler)
app.use(errorHandler)

module.exports = app
