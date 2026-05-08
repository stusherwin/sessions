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

type PageState = { page: 'sessions' } 
               | { page: 'tunes' } 
               | { page: 'session', data: Waveform } 
               | { page: 'tune', data: Tune }

interface App {
  initialised: boolean
  loaded: boolean
  data: AppData
  pageState: PageState
  loading: boolean
  saving: boolean
  uploading: boolean
  error: boolean
  playing: boolean
  editing: boolean
  nextTuneId: number
  nextPerformanceId: number
  fileUpload: string | undefined
  newSessionName: string | undefined

  init: () => void
  findSession: (id: string) => Session
  findTune: (id: string) => Tune
  findPerformance: (id: string) => Performance
  loadSession: (sessionId: string, sessionName: string) => void
  loadTune: (tuneId: string) => void
  loadSessions: () => void
  loadTunes: () => void
  updateTuneName: (sessionId: string, tuneId: string, name: string) => void
  deletePerformance: (sessionId: string, tuneId: string) => void
  playFromStart: () => void
  skipToStart: () => void
  skipToEnd: () => void
  skipBackward: () => void
  skipForward: () => void
  playPause: () => void
  zoomIn: () => void
  zoomOut: () => void
  toggleEditing: () => void
  changeTune: (sessionId: string, performanceId: string, newTuneId: string) => void
  uploadFile: (form: HTMLFormElement) => void
  saveData: () => void
  saveDataDebounced: (() => void) | undefined,
  onPerformanceCreating: (detail: {sessionId: string, startTime: number, endTime: number}) => void
  onPerformanceUpdating: (detail: {sessionId: string, performanceId: string, startTime: number, endTime: number}) => void
  onCurrentPerformanceChanged: (detail: {sessionId: string, performanceId: string | undefined}) => void
}

const App = defineComponent<unknown, App>(() => ({
  initialised: false,
  loaded: false,
  data: { 
    sessions: [], 
    tunes: [], 
    performances: []
  }, 
  pageState: { page: 'sessions' } as PageState,
  loading: true,
  saving: false,
  uploading: false,
  error: false,
  playing: false,
  editing: false,
  nextTuneId: 0,
  nextPerformanceId: 0,
  fileUpload: undefined,
  newSessionName: undefined,

  init() { log(arguments)()
    this.initialised = true
    window.fetch(new Request("http://localhost:5110/sessions"))
      .then((response) => {
        if(!response.ok) { 
            throw new Error('JSON file not found');
        }

        return response.json() as Promise<AppData>
      })
      .then((data : AppData) => {
        log(data)()
        this.data.sessions = data.sessions
        this.data.tunes = data.tunes
        this.data.performances = data.performances

        var maxTuneId = 0
        for(var tune of this.data.tunes) {
          var id = parseInt(tune.id.split('-')[1])
          if(id > maxTuneId) {
            maxTuneId = id
          }
        }
        this.nextTuneId = maxTuneId + 1

        var maxPerfId = 0
        for(var perf of this.data.performances) {
          var id = parseInt(perf.id.split('-')[1])
          if(id > maxPerfId) {
            maxPerfId = id
          }
        }
        this.nextPerformanceId = maxPerfId + 1
        this.error = false
        this.loaded = true
      })
      .catch(err => {
        console.error(err)
        this.error = true
      })
      .finally(() => {
        this.loading = false
      })
  },

  findSession(id: string): Session {
    var session = this.data.sessions.find(s => s.id == id)
    if(!session) {
      throw new Error(`Session not found: ${id}`)
    }
    return session
  },

  findTune(id: string): Tune {
    var tune = this.data.tunes.find(s => s.id == id)
    if(!tune) {
      throw new Error(`Tune not found: ${id}`)
    }
    return tune
  },

  findPerformance(id: string): Performance {
    var performance = this.data.performances.find(s => s.id == id)
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
    // this.editing = false

    var performances = this.data.performances.filter(p => p.sessionId == sessionId)
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
    // this.editing = false
  },

  loadSessions() { log(arguments)()
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.session.id)
    }

    this.pageState = {
      page: 'sessions'
    }
    // this.editing = false
  },

  loadTunes() { log(arguments)()
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.session.id)
    }

    this.pageState = {
      page: 'tunes'
    }
    // this.editing = false
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
    this.$dispatch('sx:zoom-in')
  },

  zoomOut() { log(arguments)()
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
    this.data.performances = this.data.performances.filter(p => p.id != performanceId)
    if(this.data.performances.filter(p => p.tuneId == tuneId).length == 0) {
      this.data.tunes = this.data.tunes.filter(t => t.id != tuneId)
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
    if(this.data.performances.filter(p => p.tuneId == tuneId).length == 0) {
      this.data.tunes = this.data.tunes.filter(t => t.id != tuneId)
    }

    this.$dispatch('sx:performance-updated', performance)
  },

  uploadFile(form: HTMLFormElement) { log(arguments)()
    this.uploading = true
    var data = new FormData()
    
    var inputs = form.getElementsByTagName('input')
    
    for(var input of inputs) {
      if(input.files && input.files.length) {
        data.append(input.name, input.files[0])
      } else {
        data.append(input.name, input.value)
      }
    }

    window.fetch("http://localhost:5110/file", { method: 'POST', body: data })
      .then(async (response) => {
        console.log(response)

        if(!response.ok) {
          var error = await response.text();
          throw new Error(error);
        }

        return response.json() as Promise<Session>
      })
      .then((session : Session) => {
        this.data.sessions.push(session)
        this.error = false
      })
      .catch(err => {
        console.error(err)
        this.error = true
      })
      .finally(() => {
        this.fileUpload = undefined
        this.newSessionName = undefined
        this.uploading = false
      })
  },

  saveDataDebounced: undefined,

  saveData() {
    if(!this.loaded) {
      return
    }

    if(!this.saveDataDebounced) {
      this.saveDataDebounced = Alpine.debounce(() => {
        this.saving = true

        window.fetch("http://localhost:5110/sessions", { method: 'POST', body: JSON.stringify(this.data), headers: {
          "Content-Type": "application/json",
        }})
          .then(async (response) => {
            if(!response.ok) { 
              var error = await response.text();
              throw new Error(error);
            }
            this.error = false
          })
          .catch(err => {
            console.error(err)
            this.error = true
          })
          .finally(() => {
            setTimeout(() => {
              this.saving = false
            }, 1000)
            this.saveDataDebounced = undefined
          })
      }, 500)
    }

    this.saveDataDebounced()
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

    this.data.tunes.push(tune)
    this.data.performances.push(performance)

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