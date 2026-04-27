import type { AlpineComponent } from 'alpinejs'
import type { Session, Tune, TunePerformance } from './data.ts'

export const defineComponent = <P, T>(fn: (params: P) => AlpineComponent<T>) => fn

interface Waveform {
  ready: boolean
  loading: number
  sessionId: string
  sessionName: string
  tunes: TunePerformance[],
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
  createTune: (sessionId: string, startTime: number, endTime: number) => void
  updateTune: (sessionId: string, tuneId: string, startTime: number, endTime: number) => void
  updateTuneName: (sessionId: string, tuneId: string, name: string) => void
  updateCurrentTune: (sessionId: string, tuneId: string | undefined) => void
  deleteTunePerformance: (sessionId: string, tuneId: string) => void
  playFromStart: () => void
  skipToStart: () => void
  skipToEnd: () => void
  skipBackward: () => void
  skipForward: () => void
  playPause: () => void
}

const App = defineComponent<unknown, App>(() => ({ 
  sessions: [], 
  tunes: [], 
  pageState: { page: 'sessions' },
  playing: false,
  editing: false,

  init() {
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

  loadSession(sessionId: string, tuneId: string | undefined = undefined) {
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.sessionId)
    }

    var session = this.sessions.find(s => s.id == sessionId)
    if(!session) {
      return
    }

    this.pageState = {
      page: 'session',
      data: {
        sessionId,
        sessionName: session.name,
        ready: false,
        loading: 0,
        tunes: session.tunes,
        currentTune: undefined
      }
    }
    this.editing = false

    this.$dispatch('sx:waveform-loading', { session: session, tuneId: tuneId })
  },

  loadTune(tuneId: string) {
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.sessionId)
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

  loadSessions() {
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.sessionId)
    }

    this.pageState = {
      page: 'sessions'
    }
    this.editing = false
  },

  loadTunes() {
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.sessionId)
    }

    this.pageState = {
      page: 'tunes'
    }
    this.editing = false
  },

  createTune(sessionId: string, startTime: number, endTime: number) {
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

  updateTune(sessionId: string, tuneId: string, startTime: number, endTime: number) {
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

  updateTuneName(sessionId: string, tuneId: string, name: string) {
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

  updateCurrentTune(sessionId: string, tuneId: string | undefined) {
    if(this.pageState.page != 'session' || this.pageState.data.sessionId != sessionId) {
      return
    }

    this.pageState.data.currentTune = tuneId
  },

  deleteTunePerformance(sessionId: string, tuneId: string) {
    if(this.pageState.page != 'session' || this.pageState.data.sessionId != sessionId) {
      return
    }

    var session = this.sessions.find(s => s.id == sessionId)
    var tune = this.tunes.find(t => t.id == tuneId)
    var sessionPerf = session?.tunes.find(t => t.tuneId == tuneId)
    var tunePerf = tune?.performances.find(t => t.sessionId == sessionId)

    if(!tune || !session || !sessionPerf || !tunePerf) {
      return
    }

    this.pageState.data.tunes = this.pageState.data.tunes.filter(t => t.tuneId != tuneId)
    this.pageState.data.currentTune = undefined
    session.tunes = session.tunes.filter(t => t.tuneId != tuneId)
    tune.performances = tune.performances.filter(t => t.tuneId != tuneId)

    this.$dispatch('sx:tune-performance-deleted', sessionPerf)
  },

  playFromStart() {
    this.$dispatch('sx:play-from-start')
  },

  skipToStart() {
    this.$dispatch('sx:skip-to-start')
  },

  skipToEnd() {
    this.$dispatch('sx:skip-to-end')
  },

  skipBackward() {
    this.$dispatch('sx:skip-backward')
  },

  skipForward() {
    this.$dispatch('sx:skip-forward')
  },

  playPause() {
    this.$dispatch('sx:play-pause')
  },

  zoomIn() {
    this.$dispatch('sx:zoom-in')
  },

  zoomOut() {
    this.$dispatch('sx:zoom-out')
  },

  toggleEditing() {
    this.editing = !this.editing
    if(this.editing) {
        this.$dispatch('sx:editing-start')
    } else {
        this.$dispatch('sx:editing-stop')
    }
  }

}))

export default App