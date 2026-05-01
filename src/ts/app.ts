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
  onTuneUpdating: (detail: {sessionId: string, tuneId: string, startTime: number, endTime: number}) => void
  onCurrentTuneChanged: (detail: {sessionId: string, tuneId: string | undefined}) => void
}

const App = defineComponent<unknown, App>(() => ({ 
  sessions: [], 
  tunes: [], 
  pageState: { page: 'sessions' },
  playing: false,
  editing: false,

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
      })
      .catch(err => {
        console.error(err)
      })
      .finally(() => {
      })
  },

  loadSession(sessionId: string, tuneId: string | undefined = undefined) { log(arguments)()
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

    this.$dispatch('sx:waveform-loading', { session: session, tuneId: tuneId })
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

  updateTuneName(sessionId: string, tuneId: string, name: string) { log(sessionId, tuneId, name)
    var session = this.sessions.find(s => s.id == sessionId)
    var tune = this.tunes.find(t => t.id == tuneId)
    var sessionPerf = session?.tunes.find(t => t.tuneId == tuneId)
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

  deleteTunePerformance(sessionId: string, tuneId: string) { log(arguments)()

    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

    var session = this.sessions.find(s => s.id == sessionId)
    var tune = this.tunes.find(t => t.id == tuneId)
    var sessionPerf = session?.tunes.find(t => t.tuneId == tuneId)
    var tunePerf = tune?.performances.find(t => t.sessionId == sessionId)

    if(!tune || !session || !sessionPerf || !tunePerf) {
      return
    }

    this.pageState.data.currentTune = undefined
    session.tunes = session.tunes.filter(t => t.tuneId != tuneId)
    tune.performances = tune.performances.filter(t => t.tuneId != tuneId)

    log(this.pageState.data.session.tunes)

    this.$dispatch('sx:tune-performance-deleted', sessionPerf)
  },

  onTuneCreating(detail: {sessionId: string, startTime: number, endTime: number}) {  log(arguments)()
    var sessionId = detail.sessionId
    var startTime = detail.startTime
    var endTime = detail.endTime

    var session = this.sessions.find(s => s.id == sessionId)

    if(!session) {
      return
    }

    var nextTuneId = this.tunes.length + 1
    var tuneId = 'tune-' + nextTuneId
    var tuneName = 'Tune ' + nextTuneId

    var perf : TunePerformance = {
      tuneId,
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

  onTuneUpdating(detail: {sessionId: string, tuneId: string, startTime: number, endTime: number}) { log(arguments)()
    var sessionId = detail.sessionId
    var tuneId = detail.tuneId
    var startTime = detail.startTime
    var endTime = detail.endTime

    var session = this.sessions.find(s => s.id == sessionId)
    var tune = this.tunes.find(t => t.id == tuneId)
    var sessionPerf = session?.tunes.find(t => t.tuneId == tuneId)
    var tunePerf = tune?.performances.find(t => t.tuneId == tuneId)

    if(!sessionPerf || !tunePerf) {
      return
    }

    sessionPerf.startTime = startTime
    sessionPerf.endTime = endTime
    tunePerf.startTime = startTime
    tunePerf.endTime = endTime

    this.$dispatch('sx:tune-updated', sessionPerf)
  },

  onCurrentTuneChanged(detail: {sessionId: string, tuneId: string | undefined}) { log(arguments)()
    var sessionId = detail.sessionId
    var tuneId = detail.tuneId

    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

    this.pageState.data.currentTune = tuneId
  }
}))

export default App