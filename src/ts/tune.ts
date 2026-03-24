export interface TuneData {
  id: string
  name: string
  performances: TunePerformanceData[]
}

export interface TunePerformanceData {
  id: string
  tuneId: string
  tuneName: string
  sessionId: string
  sessionName: string
  startTime: number
  endTime: number
}

export class Tune {
  id: string
  name: string
  performances: TunePerformance[]

  constructor(data: TuneData) {
    this.id = data.id
    this.name = data.name
    this.performances = data.performances.map(p => new TunePerformance(p.id, p.sessionId, p.sessionName, p.startTime, p.endTime))
  }

  export() : TuneData {
    return {
      id: this.id,
      name: this.name,
      performances: this.performances.map(p => ({
        id: p.id,
        tuneId: this.id,
        tuneName: this.name,
        sessionId: p.sessionId,
        sessionName: p.sessionName,
        startTime: p.startTime,
        endTime: p.endTime
      }))
    }
  }
}

export class TunePerformance {
  id: string
  sessionId: string
  sessionName: string
  startTime: number
  endTime: number

  constructor(id: string, sessionId: string, sessionName: string, startTime: number, endTime: number) {
    this.id = id
    this.sessionId = sessionId
    this.sessionName = sessionName
    this.startTime = startTime
    this.endTime = endTime
  }
}