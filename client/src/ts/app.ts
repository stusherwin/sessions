import type { AlpineComponent } from 'alpinejs'
import { AppDataManager } from './data.ts'
import type { Session, Tune, Performance } from './data.ts'
import { log } from './common.ts'

export const defineComponent = <P, T>(fn: (params: P) => AlpineComponent<T>) => fn

interface Waveform {
  ready: boolean
  loading: number
  session: Session
  currentPerformance: string | undefined
}

type PageState = { page: 'sessions' } 
               | { page: 'tunes' } 
               | { page: 'session', data: Waveform } 
               | { page: 'tune', data: Tune }

interface App {
  initialised: boolean
  data: AppDataManager
  pageState: PageState
  playing: boolean
  editing: boolean
  nextTuneId: number
  nextPerformanceId: number
  fileUpload: string | undefined
  newSessionName: string | undefined

  init: () => void
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
  onPerformanceCreating: (detail: {sessionId: string, startTime: number, endTime: number}) => void
  onPerformanceUpdating: (detail: {sessionId: string, performanceId: string, startTime: number, endTime: number}) => void
  onCurrentPerformanceChanged: (detail: {sessionId: string, performanceId: string | undefined}) => void
}

const App = defineComponent<unknown, App>(() => ({
  initialised: false,
  data: new AppDataManager, 
  pageState: { page: 'sessions' } as PageState,
  playing: false,
  editing: false,
  nextTuneId: 0,
  nextPerformanceId: 0,
  fileUpload: undefined,
  newSessionName: undefined,

  init() { log(arguments)()
    this.initialised = true
    this.data.load()
  },

  loadSession(sessionId: string, performanceId: string | undefined = undefined) { log(arguments)()
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.session.id)
    }

    const session = this.data.findSession(sessionId)

    this.pageState = {
      page: 'session',
      data: {
        session: session,
        ready: false,
        loading: 0,
        currentPerformance: undefined
      }
    }

    var performances = this.data.performances.filter(p => p.sessionId == sessionId)
    this.$dispatch('sx:waveform-loading', { session: session, performances, performanceId })
  },

  loadTune(tuneId: string) { log(arguments)()
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.session.id)
    }

    var tune = this.data.findTune(tuneId)
    log(tune)()

    this.pageState = {
      page: 'tune',
      data: tune
    }
  },

  loadSessions() { log(arguments)()
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.session.id)
    }

    this.pageState = {
      page: 'sessions'
    }
  },

  loadTunes() { log(arguments)()
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.session.id)
    }

    this.pageState = {
      page: 'tunes'
    }
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

    var performance = this.data.findPerformance(performanceId)
    var tune = this.data.findTune(performance.tuneId)

    performance.tuneName = tuneName
    tune.name = tuneName

    this.$dispatch('sx:performance-updated', performance)
  },

  updateSessionName(sessionId: string, sessionName: string) { log(arguments)()
    if(this.pageState.page != 'sessions') {
      return
    }

    for(var performance of this.data.performancesForSession(sessionId)) {
      performance.sessionName = sessionName
      this.$dispatch('sx:performance-updated', performance)
    }
  },

  deletePerformance(sessionId: string, performanceId: string) { log(arguments)()
    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

    var performance = this.data.findPerformance(performanceId)
    var tune = this.data.findTune(performance.tuneId)

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

    var performance = this.data.findPerformance(performanceId)
    var tune = this.data.findTune(performance.tuneId)
    var newTune = this.data.findTune(newTuneId)

    var tuneId = tune.id
    performance.tuneId = newTuneId
    performance.tuneName = newTune.name
    if(this.data.performances.filter(p => p.tuneId == tuneId).length == 0) {
      this.data.tunes = this.data.tunes.filter(t => t.id != tuneId)
    }

    this.$dispatch('sx:performance-updated', performance)
  },

  uploadFile(form: HTMLFormElement) { log(arguments)()
    var formData = new FormData()
    
    var inputs = form.getElementsByTagName('input')
    
    for(var input of inputs) {
      if(input.files && input.files.length) {
        formData.append(input.name, input.files[0])
      } else {
        formData.append(input.name, input.value)
      }
    }

    this.data.upload(formData)
      .then(() => {
        this.fileUpload = undefined
        this.newSessionName = undefined
      })
  },

  onPerformanceCreating(detail: {sessionId: string, startTime: number, endTime: number}) { log(arguments)()
    var sessionId = detail.sessionId
    var startTime = detail.startTime
    var endTime = detail.endTime

    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

    var session = this.data.findSession(sessionId)

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

    var performance = this.data.findPerformance(performanceId)

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