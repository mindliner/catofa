import { CONTROL_ROOM_KEY_HEADER, getStoredControlRoomKey } from './auth'

export class HttpError extends Error {
  status?: number
  body?: string
}
type UnauthorizedHandler = (error: HttpError) => void

const unauthorizedHandlers = new Set<UnauthorizedHandler>()

export const registerUnauthorizedHandler = (handler: UnauthorizedHandler) => {
  unauthorizedHandlers.add(handler)
  return () => {
    unauthorizedHandlers.delete(handler)
  }
}

const notifyUnauthorized = (error: HttpError) => {
  unauthorizedHandlers.forEach((handler) => handler(error))
}

export const fetchJSON = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers || {})
  const hasBody = init && 'body' in init && init.body !== undefined
  if (!(hasBody && init?.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const controlRoomKey = getStoredControlRoomKey()
  if (controlRoomKey) {
    headers.set(CONTROL_ROOM_KEY_HEADER, controlRoomKey)
  }

  const response = await fetch(path, {
    ...init,
    headers,
  })

  const text = await response.text()

  if (!response.ok) {
    const error = new HttpError(text || response.statusText)
    error.status = response.status
    error.body = text
    if (response.status === 401) {
      notifyUnauthorized(error)
    }
    throw error
  }

  if (!text) {
    return {} as T
  }

  try {
    return JSON.parse(text) as T
  } catch (parseError) {
    throw new Error(`Unable to parse JSON response from ${path}: ${(parseError as Error).message}`)
  }
}
