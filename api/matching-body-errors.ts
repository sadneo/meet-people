import type { ErrorRequestHandler } from 'express'

// Mount on the same Express path as the matching router. Express itself applies
// case/boundary matching, including while dispatching parser errors.
export const boundedMatchingBodyError: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  const type = error && typeof error === 'object' && 'type' in error ? error.type : undefined
  if (!['entity.parse.failed', 'entity.too.large', 'encoding.unsupported', 'charset.unsupported', 'request.size.invalid'].includes(String(type))) {
    next(error)
    return
  }
  response.set('Cache-Control', 'no-store').status(400).json({ code: 'invalid', error: 'Invalid matching request body.' })
}
