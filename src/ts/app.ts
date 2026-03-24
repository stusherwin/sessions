import { Session } from './session'
import type { SessionData } from './session'
import { Tune } from './tune'
import type { TuneData } from './tune'

interface Data {
  sessions: SessionData[]
  tunes: TuneData[]
}

export class App {
  nextTuneId: number = 1
  nextTunePerformanceId: number = 1

  sessions: { [key: string]: Session }
  tunes: { [key: string]: Tune }
  
  init() {
  }

  constructor(data: Data) {
    const createTune = (sessionId: string, startTime: number, endTime: number) => this.createTune(sessionId, startTime, endTime)
    this.sessions = Object.fromEntries(data.sessions.map(s => [s.id, new Session(s, createTune)]))
    this.tunes = Object.fromEntries(data.tunes.map(t => [t.id, new Tune(t)]))

    this.nextTuneId = data.tunes.length + 1
    this.nextTunePerformanceId = data.tunes.map(t => t.performances.length).reduce((sum, n) => sum + n) + 1
  }

  createTune(sessionId: string, startTime: number, endTime: number): Tune {
    var tuneId = 'tune-' + this.nextTuneId
    var tuneName = 'Tune ' + this.nextTuneId
    var perfId = 'perf-' + this.nextTunePerformanceId
    var session = this.sessions[sessionId]
    var newTune = new Tune({
      id: tuneId, 
      name: tuneName,
      performances: [{
        id: perfId,
        tuneId,
        tuneName,
        sessionId,
        sessionName: session.name,
        startTime, 
        endTime
      }]
    })

    this.tunes[tuneId] = newTune
    console.log(this.tunes)
    this.nextTuneId++
    this.nextTunePerformanceId++

    return newTune
  }

  export(): Data {
    return {
      sessions: Object.values(this.sessions).map(s => s.export()),
      tunes: Object.values(this.tunes).map(t => t.export())
    }
  }
}