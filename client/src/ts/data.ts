export interface Session {
  id: string
  name: string
  filename: string
  peaks: number[][] | undefined
  duration: number | undefined
}

export interface Tune {
  id: string
  name: string
}

export interface Performance {
  id: string
  tuneId: string
  tuneName: string
  sessionId: string
  sessionName: string
  startTime: number
  endTime: number
}