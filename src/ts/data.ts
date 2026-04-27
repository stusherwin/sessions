export interface Session {
  id: string,
  name: string,
  filename: string,
  peaks: number[][] | undefined,
  duration: number | undefined,
  tunes: TunePerformance[]
}

export interface Tune {
  id: string
  name: string
  performances: TunePerformance[]
}

export interface TunePerformance {
  tuneId: string
  tuneName: string
  sessionId: string
  sessionName: string
  startTime: number
  endTime: number
}
