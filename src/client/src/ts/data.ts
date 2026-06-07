import { log, sleep } from './common.ts'

export interface Session {
  id: string
  name: string
  processed: boolean
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

export interface AppData {
  sessions: Session[]
  tunes: Tune[]
  performances: Performance[]
}

export class AppDataManager implements AppData {
  sessions: Session[] = []
  tunes: Tune[] = []
  performances: Performance[] = []
  loading: boolean = true
  loaded: boolean = false
  saving: boolean = false
  error: boolean = false
  nextTuneId: number = 0
  nextPerformanceId: number = 0
  saveDebounced: (() => void) | undefined = undefined

  load(callback: () => void) { log(arguments)()
    window.fetch(new Request("/api/sessions"))
      .then((response) => {
        if(!response.ok) { 
            throw new Error('JSON file not found');
        }

        return response.json() as Promise<AppData>
      })
      .then((data : AppData) => {
        log(data)()
        this.sessions = data.sessions
        this.tunes = data.tunes
        this.performances = data.performances

        var maxTuneId = 0
        for(var tune of this.tunes) {
          var id = parseInt(tune.id.split('-')[1])
          if(id > maxTuneId) {
            maxTuneId = id
          }
        }
        this.nextTuneId = maxTuneId + 1

        var maxPerfId = 0
        for(var perf of this.performances) {
          var id = parseInt(perf.id.split('-')[1])
          if(id > maxPerfId) {
            maxPerfId = id
          }
        }
        this.nextPerformanceId = maxPerfId + 1
        this.error = false
        setTimeout(() => this.loaded = true)
      })
      .catch(err => {
        console.error(err)
        this.error = true
      })
      .finally(() => {
        this.loading = false
        callback()
      })
  }

  findSession(id: string): Session { log(arguments)()
    var session = this.sessions.find(s => s.id == id)
    if(!session) {
      throw new Error(`Session not found: ${id}`)
    }
    return session
  }

  findTune(id: string): Tune { log(arguments)()
    var tune = this.tunes.find(s => s.id == id)
    if(!tune) {
      throw new Error(`Tune not found: ${id}`)
    }
    return tune
  }

  findPerformance(id: string): Performance { log(arguments)()
    var performance = this.performances.find(s => s.id == id)
    if(!performance) {
      throw new Error(`Performance not found: ${id}`)
    }
    return performance
  }

  performancesForSession(sessionId: string) {
    return this.performances.filter(p => p.sessionId == sessionId)
  }

  performancesForTune(tuneId: string) {
    return this.performances.filter(p => p.tuneId == tuneId)
  }

  createPerformance(sessionId: string, startTime: number, endTime: number) {
    var session = this.findSession(sessionId)

    var tuneId = 'tune-' + this.nextTuneId
    var tuneName = 'Tune ' + this.nextTuneId
    this.nextTuneId++
    
    var performanceId = 'perf-' + this.nextPerformanceId
    this.nextPerformanceId++

    var performance : Performance = {
      id: performanceId,
      tuneId: tuneId,
      tuneName,
      sessionId,
      sessionName: session.name || '',
      startTime,
      endTime
    }

    var tune : Tune = {
      id: tuneId,
      name: tuneName
    }

    this.tunes.push(tune)
    this.performances.push(performance)

    return performance
  }

  deletePerformance(id: string) {
    var performance = this.findPerformance(id)
    var tune = this.findTune(performance.tuneId)

    var tuneId = tune.id
    this.performances = this.performances.filter(p => p.id != id)
    if(this.performances.filter(p => p.tuneId == tuneId).length == 0) {
      this.tunes = this.tunes.filter(t => t.id != tuneId)
    }
  }

  deleteSession(id: string) {
    if(this.performancesForSession(id).length) {
      return
    }
    this.sessions = this.sessions.filter(s => s.id != id)
  }

  deleteTune(id: string) {
    if(this.performancesForTune(id).length) {
      return
    }
    this.tunes = this.tunes.filter(t => t.id != id)
  }

  changeTune(performanceId: string, newTuneId: string) {
    var performance = this.findPerformance(performanceId)
    var tune = this.findTune(performance.tuneId)
    var newTune = this.findTune(newTuneId)

    var tuneId = tune.id
    performance.tuneId = newTuneId
    performance.tuneName = newTune.name
    if(this.performances.filter(p => p.tuneId == tuneId).length == 0) {
      this.tunes = this.tunes.filter(t => t.id != tuneId)
    }
  }

  save() { log(arguments)()
    if(!this.saveDebounced) {
      this.saveDebounced = Alpine.debounce(async () => {
        if(!this.loaded || this.saving) {
          return
        }

        this.saving = true
        this.error = false

        log(this.sessions)();

        window.fetch("/api/sessions", { method: 'POST', body: JSON.stringify({
          sessions: this.sessions,
          tunes: this.tunes,
          performances: this.performances
        }), headers: {
          "Content-Type": "application/json",
        }})
          .then(async (response) => {
            if(!response.ok) { 
              var error = await response.text();
              throw new Error(error);
            }
          })
          .catch(err => {
            console.error(err)
            this.error = true
          })
          .finally(() => {
            setTimeout(() => {
              this.saving = false
            }, 1000)
            this.saveDebounced = undefined
          })
      }, 500)
    }

    this.saveDebounced()
  }

  async upload(formData: FormData) {
    if(this.saving) do {
      await sleep(100);
    } while(this.saving)

    this.saving = true
    this.error = false

    return window.fetch("/api/session", { method: 'POST', body: formData })
      .then(async (response) => {
        log(response)()

        if(!response.ok) {
          var error = await response.text();
          throw new Error(error);
        }

        return response.json() as Promise<Session>
      })
      .then((session : Session) => {
        this.sessions.push(session)
      })
      .catch(err => {
        console.error(err)
        this.error = true
      })
      .finally(() => {
        setTimeout(() => {
          this.saving = false
        }, 1000)
      })
  }
}
