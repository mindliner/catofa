const STORAGE_KEY = 'catofa.controlRoomKey'
export const CONTROL_ROOM_KEY_HEADER = 'x-control-room-key'

const hasWindow = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

export const getStoredControlRoomKey = (): string | null => {
  if (!hasWindow()) return null
  return window.localStorage.getItem(STORAGE_KEY)
}

export const saveControlRoomKey = (value: string) => {
  if (!hasWindow()) return
  window.localStorage.setItem(STORAGE_KEY, value)
}

export const clearControlRoomKey = () => {
  if (!hasWindow()) return
  window.localStorage.removeItem(STORAGE_KEY)
}
