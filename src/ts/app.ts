import type { AlpineComponent } from 'alpinejs'
import type { Session, Tune, TunePerformance } from './data.ts'
import { log } from './common.ts'

export const defineComponent = <P, T>(fn: (params: P) => AlpineComponent<T>) => fn

interface Waveform {
  ready: boolean
  loading: number
  session: Session
  currentTune: string | undefined
}

interface AppData {
  sessions: Session[]
  tunes: Tune[]
}

interface App {
  sessions: Session[] 
  tunes: Tune[]
  pageState: { page: 'sessions' } | { page: 'tunes' } | { page: 'session', data: Waveform } | { page: 'tune', data: Tune }
  playing: boolean
  editing: boolean
  nextTuneId: number
  nextPerfId: number

  init: () => void
  loadSession: (sessionId: string, sessionName: string) => void
  updateTuneName: (sessionId: string, tuneId: string, name: string) => void
  deleteTunePerformance: (sessionId: string, tuneId: string) => void
  playFromStart: () => void
  skipToStart: () => void
  skipToEnd: () => void
  skipBackward: () => void
  skipForward: () => void
  playPause: () => void
  onTuneCreating: (detail: {sessionId: string, startTime: number, endTime: number}) => void
  onTuneUpdating: (detail: {sessionId: string, id: string, startTime: number, endTime: number}) => void
  onCurrentTuneChanged: (detail: {sessionId: string, id: string | undefined}) => void
}

const App = defineComponent<unknown, App>(() => ({ 
  sessions: [], 
  tunes: [], 
  pageState: { page: 'sessions' },
  playing: false,
  editing: false,
  nextTuneId: 0,
  nextPerfId: 0,

  init() { log(arguments)()
    window.fetch(new Request("/sessions.json"))
      .then((response) => {
        if(!response.ok) { 
            throw new Error('JSON file not found');
        }

        return response.json() as Promise<AppData>
      })
      .then((data : AppData) => {
        this.sessions = data.sessions
        this.tunes = data.tunes

        var maxTuneId = 0
        var maxPerfId = 0
        for(var tune of this.tunes) {
          var id = parseInt(tune.id.split('-')[1])
          if(id > maxTuneId) {
            maxTuneId = id
          }
          for(var perf of tune.performances) {
            var id = parseInt(perf.id.split('-')[1])
            if(id > maxPerfId) {
              maxPerfId = id
            }
          }
        }
        for(var session of this.sessions) {
          for(var perf of session.tunes) {
            var id = parseInt(perf.id.split('-')[1])
            if(id > maxPerfId) {
              maxPerfId = id
            }
          }
        }
        this.nextTuneId = maxTuneId + 1
        this.nextPerfId = maxPerfId + 1
      })
      .catch(err => {
        console.error(err)
      })
      .finally(() => {
      })
  },

  loadSession(sessionId: string, performanceId: string | undefined = undefined) { log(arguments)()
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.session.id)
    }

    var session = this.sessions.find(s => s.id == sessionId)
    if(!session) {
      return
    }

    this.pageState = {
      page: 'session',
      data: {
        session: session,
        ready: false,
        loading: 0,
        currentTune: undefined
      }
    }
    this.editing = false

    this.$dispatch('sx:waveform-loading', { session: session, performanceId })
  },

  loadTune(tuneId: string) { log(arguments)()
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.session.id)
    }

    var tune = this.tunes.find(t => t.id == tuneId)
    if(!tune) {
      return
    }

    this.pageState = {
      page: 'tune',
      data: tune
    }
    this.editing = false
  },

  loadSessions() { log(arguments)()
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.session.id)
    }

    this.pageState = {
      page: 'sessions'
    }
    this.editing = false
  },

  loadTunes() { log(arguments)()
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.session.id)
    }

    this.pageState = {
      page: 'tunes'
    }
    this.editing = false
  },

  updateTuneName(sessionId: string, id: string, name: string) { log(arguments)()
    var session = this.sessions.find(s => s.id == sessionId)
    var sessionPerf = session?.tunes.find(t => t.id == id)
    var tune = this.tunes.find(t => t.id == sessionPerf?.tuneId)
    var tunePerf = tune?.performances.find(t => t.sessionId == sessionId)

    if(!tune || !session || !sessionPerf || !tunePerf) {
      return
    }

    tune.name = name
    sessionPerf.tuneName = name
    tunePerf.tuneName = name

    this.$dispatch('sx:tune-name-updated', sessionPerf)
  },

  playFromStart() { log(arguments)()
    this.$dispatch('sx:play-from-start')
  },

  skipToStart() { log(arguments)()
    this.$dispatch('sx:skip-to-start')
  },

  skipToEnd() { log(arguments)()
    this.$dispatch('sx:skip-to-end')
  },

  skipBackward() { log(arguments)()
    this.$dispatch('sx:skip-backward')
  },

  skipForward() { log(arguments)()
    this.$dispatch('sx:skip-forward')
  },

  playPause() { log(arguments)()
    this.$dispatch('sx:play-pause')
  },

  zoomIn() { log(arguments)()
    log('hi')

    this.$dispatch('sx:zoom-in')
  },

  zoomOut() { log(arguments)()
    log('hi')
    this.$dispatch('sx:zoom-out')
  },

  toggleEditing() { log(arguments)()
    this.editing = !this.editing
    if(this.editing) {
        this.$dispatch('sx:editing-start')
    } else {
        this.$dispatch('sx:editing-stop')
    }
  },

  deleteTunePerformance(sessionId: string, id: string) { log(arguments)()
    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

    var session = this.sessions.find(s => s.id == sessionId)
    var sessionPerf = session?.tunes.find(t => t.id == id)
    var tune = this.tunes.find(t => t.id == sessionPerf?.tuneId)
    var tunePerf = tune?.performances.find(t => t.sessionId == sessionId)

    if(!tune || !session || !sessionPerf || !tunePerf) {
      return
    }

    var tuneId = tune.id
    this.pageState.data.currentTune = undefined
    session.tunes = session.tunes.filter(t => t.id != id)
    tune.performances = tune.performances.filter(t => t.id != id)
    if(tune.performances.length == 0) {
      this.tunes = this.tunes.filter(t => t.id != tuneId)
    }

    log(this.pageState.data.session.tunes)

    this.$dispatch('sx:tune-performance-deleted', sessionPerf)
  },

  changeTune(sessionId: string, id: string, newTuneId: string) { log(arguments)()
    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

    var session = this.sessions.find(s => s.id == sessionId)
    var sessionPerf = session?.tunes.find(t => t.id == id)
    var tune = this.tunes.find(t => t.id == sessionPerf?.tuneId)
    var tunePerf = tune?.performances.find(t => t.sessionId == sessionId)

    var newTune = this.tunes.find(t => t.id == newTuneId)

    if(!tune || !newTune || !session || !sessionPerf || !tunePerf) {
      return
    }

    var tuneId = tune.id
    sessionPerf.tuneId = newTuneId
    sessionPerf.tuneName = newTune.name
    tunePerf.tuneId = newTuneId
    tunePerf.tuneName = newTune.name
    tune.performances = tune.performances.filter(t => t.id != id)
    if(tune.performances.length == 0) {
      this.tunes = this.tunes.filter(t => t.id != tuneId)
    }
    newTune.performances.push(tunePerf)

    this.$dispatch('sx:tune-performance-moved', { 
      id,
      sessionId,
      newTuneId,
      newTuneName: newTune.name
    })
  },

  onTuneCreating(detail: {sessionId: string, startTime: number, endTime: number}) {  log(arguments)()
    var sessionId = detail.sessionId
    var startTime = detail.startTime
    var endTime = detail.endTime

    var session = this.sessions.find(s => s.id == sessionId)

    if(!session) {
      return
    }

    var tuneId = 'tune-' + this.nextTuneId
    var tuneName = 'Tune ' + this.nextTuneId
    this.nextTuneId++
    var perfId = 'perf-' + this.nextPerfId
    this.nextPerfId++

    var perf : TunePerformance = {
      id: perfId,
      tuneId: tuneId,
      tuneName,
      sessionId,
      sessionName: session.name || '',
      startTime,
      endTime
    }

    var tune : Tune = {
      id: tuneId,
      name: tuneName,
      performances: [perf]
    }

    this.tunes.push(tune)
    session.tunes.push(perf)

    this.$dispatch('sx:tune-created', perf)
  },

  onTuneUpdating(detail: {sessionId: string, id: string, startTime: number, endTime: number}) { log(arguments)()
    var sessionId = detail.sessionId
    var id = detail.id
    var startTime = detail.startTime
    var endTime = detail.endTime

    var session = this.sessions.find(s => s.id == sessionId)
    var sessionPerf = session?.tunes.find(t => t.id == id)
    var tune = this.tunes.find(t => t.id == sessionPerf?.tuneId)
    var tunePerf = tune?.performances.find(t => t.sessionId == sessionId)

    if(!sessionPerf || !tunePerf) {
      return
    }

    sessionPerf.startTime = startTime
    sessionPerf.endTime = endTime
    tunePerf.startTime = startTime
    tunePerf.endTime = endTime

    this.$dispatch('sx:tune-updated', sessionPerf)
  },

  onCurrentTuneChanged(detail: {sessionId: string, id: string | undefined}) { log(arguments)()
    var sessionId = detail.sessionId
    var id = detail.id

    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

    this.pageState.data.currentTune = id
  }
}))

export default App