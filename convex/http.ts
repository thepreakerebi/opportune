import { httpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { auth } from './auth'
import { resend } from './functions/emails'

const http = httpRouter()

// Convex Auth HTTP endpoints for OAuth callbacks
auth.addHttpRoutes(http)

// Resend webhook endpoint
http.route({
  path: '/resend-webhook',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    return await resend.handleResendEventWebhook(ctx, req)
  }),
})

export default http

