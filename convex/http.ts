import { httpRouter } from 'convex/server'
import { auth } from './auth'

const http = httpRouter()

// Convex Auth HTTP endpoints for OAuth callbacks
auth.addHttpRoutes(http)

export default http

