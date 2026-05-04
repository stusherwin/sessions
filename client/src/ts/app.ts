import type { AlpineComponent } from 'alpinejs'
import type { Session, Tune, Performance } from './data.ts'
import { log } from './common.ts'

export const defineComponent = <P, T>(fn: (params: P) => AlpineComponent<T>) => fn

interface Waveform {
  ready: boolean
  loading: number
  session: Session
  currentPerformance: string | undefined
}

interface AppData {
  sessions: Session[]
  tunes: Tune[]
  performances: Performance[]
}

interface App {
  sessions: Session[] 
  tunes: Tune[]
  performances: Performance[]
  pageState: { page: 'sessions' } | { page: 'tunes' } | { page: 'session', data: Waveform } | { page: 'tune', data: Tune }
  playing: boolean
  editing: boolean
  nextTuneId: number
  nextPerformanceId: number

  init: () => void
  findSession: (id: string) => Session
  findTune: (id: string) => Tune
  findPerformance: (id: string) => Performance
  loadSession: (sessionId: string, sessionName: string) => void
  updateTuneName: (sessionId: string, tuneId: string, name: string) => void
  deletePerformance: (sessionId: string, tuneId: string) => void
  playFromStart: () => void
  skipToStart: () => void
  skipToEnd: () => void
  skipBackward: () => void
  skipForward: () => void
  playPause: () => void
  onPerformanceCreating: (detail: {sessionId: string, startTime: number, endTime: number}) => void
  onPerformanceUpdating: (detail: {sessionId: string, performanceId: string, startTime: number, endTime: number}) => void
  onCurrentPerformanceChanged: (detail: {sessionId: string, performanceId: string | undefined}) => void
}

const App = defineComponent<unknown, App>(() => ({ 
  sessions: [], 
  tunes: [], 
  performances: [], 
  pageState: { page: 'sessions' },
  playing: false,
  editing: false,
  nextTuneId: 0,
  nextPerformanceId: 0,

  init() { log(arguments)()
    window.fetch(new Request("http://localhost:5110/sessions"))
      .then((response) => {
        if(!response.ok) { 
            throw new Error('JSON file not found');
        }

        return response.json() as Promise<AppData>
      })
      .then((data : AppData) => {
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
      })
      .catch(err => {
        console.error(err)
      })
      .finally(() => {
      })
  },

  findSession(id: string): Session {
    var session = this.sessions.find(s => s.id == id)
    if(!session) {
      throw new Error(`Session not found: ${id}`)
    }
    return session
  },

  findTune(id: string): Tune {
    var tune = this.tunes.find(s => s.id == id)
    if(!tune) {
      throw new Error(`Tune not found: ${id}`)
    }
    return tune
  },

  findPerformance(id: string): Performance {
    var performance = this.performances.find(s => s.id == id)
    if(!performance) {
      throw new Error(`Performance not found: ${id}`)
    }
    return performance
  },

  loadSession(sessionId: string, performanceId: string | undefined = undefined) { log(arguments)()
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.session.id)
    }

    const session = this.findSession(sessionId)

    this.pageState = {
      page: 'session',
      data: {
        session: session,
        ready: false,
        loading: 0,
        currentPerformance: undefined
      }
    }
    this.editing = false

    var performances = this.performances.filter(p => p.sessionId == sessionId)
    this.$dispatch('sx:waveform-loading', { session: session, performances, performanceId })
  },

  loadTune(tuneId: string) { log(arguments)()
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.session.id)
    }

    var tune = this.findTune(tuneId)
    log(tune)()

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

  updateTuneName(sessionId: string, performanceId: string, tuneName: string) { log(arguments)()
    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

    var performance = this.findPerformance(performanceId)
    var tune = this.findTune(performance.tuneId)

    performance.tuneName = tuneName
    tune.name = tuneName

    this.$dispatch('sx:performance-updated', performance)
  },

  deletePerformance(sessionId: string, performanceId: string) { log(arguments)()
    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

    var performance = this.findPerformance(performanceId)
    var tune = this.findTune(performance.tuneId)

    var tuneId = tune.id
    this.pageState.data.currentPerformance = undefined
    this.performances = this.performances.filter(p => p.id != performanceId)
    if(this.performances.filter(p => p.tuneId == tuneId).length == 0) {
      this.tunes = this.tunes.filter(t => t.id != tuneId)
    }

    this.$dispatch('sx:performance-deleted', performance)
  },

  changeTune(sessionId: string, performanceId: string, newTuneId: string) { log(arguments)()
    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

    var performance = this.findPerformance(performanceId)
    var tune = this.findTune(performance.tuneId)
    var newTune = this.findTune(newTuneId)

    var tuneId = tune.id
    performance.tuneId = newTuneId
    performance.tuneName = newTune.name
    if(this.performances.filter(p => p.tuneId == tuneId).length == 0) {
      this.tunes = this.tunes.filter(t => t.id != tuneId)
    }

    this.$dispatch('sx:performance-updated', performance)
  },

  uploadFile(event: SubmitEvent) {
    if(!(event.target instanceof HTMLFormElement)) {
      return
    }

    var upload = event.target.children.namedItem('upload')
    if(!(upload instanceof HTMLInputElement) || upload.files == null) {
      return
    }

    var data = new FormData()
    data.append(upload.name, upload.files[0])

    window.fetch("http://localhost:5110/file", { method: 'POST', body: data })
      .then((response) => {
        console.log(response)
      })
      .catch(err => {
        console.error(err)
      })
      .finally(() => {
      })

    log(event)()
  },

  onPerformanceCreating(detail: {sessionId: string, startTime: number, endTime: number}) { log(arguments)()
    var sessionId = detail.sessionId
    var startTime = detail.startTime
    var endTime = detail.endTime

    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

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

    this.$dispatch('sx:performance-created', performance)
  },

  onPerformanceUpdating(detail: {sessionId: string, performanceId: string, startTime: number, endTime: number}) { log(arguments)()
    var sessionId = detail.sessionId
    var performanceId = detail.performanceId
    var startTime = detail.startTime
    var endTime = detail.endTime

    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

    var performance = this.findPerformance(performanceId)

    performance.startTime = startTime
    performance.endTime = endTime

    this.$dispatch('sx:performance-updated', performance)
  },

  onCurrentPerformanceChanged(detail: {sessionId: string, performanceId: string | undefined}) { log(arguments)()
    var sessionId = detail.sessionId
    var performanceId = detail.performanceId

    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

    this.pageState.data.currentPerformance = performanceId
  }
}))

export default App