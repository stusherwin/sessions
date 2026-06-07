import type { AlpineComponent } from 'alpinejs'
import { AppDataManager } from './data.ts'
import type { Session, Tune } from './data.ts'
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
               | { page: 'newSession' }

interface App {
  initialised: boolean
  data: AppDataManager
  pageState: PageState
  playing: boolean
  editing: boolean
  fileUpload: string | undefined
  newSessionName: string | undefined
  sessionProgress: { [sessionId: string] : number; }

  init: () => void
  loadSession: (sessionId: string, sessionName: string) => void
  loadTune: (tuneId: string) => void
  loadSessions: () => void
  loadTunes: () => void
  loadNewSession: () => void
  formatTime: (time: number) => string
  updateTuneName: (sessionId: string, tuneId: string, name: string) => void
  deletePerformance: (performanceId: string) => void
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
  fileUpload: undefined,
  newSessionName: undefined,
  sessionProgress: {},

  init() { log(arguments)()
    this.initialised = true
    this.data.load(() => {
      this.sessionProgress = Object.fromEntries(this.data.sessions.map(s => [s.id, s.processed ? 100 : 0]))
    })
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
    this.editing = false

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

  loadNewSession() { log(arguments)()
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.session.id)
    }

    this.pageState = {
      page: 'newSession'
    }
    this.editing = false
  },

  formatTime(time: number, includeMilliseconds: boolean = false) {
    const h = 60.0 * 60.0
    const m = 60.0
    const pad = (n: any) => n.toString().padStart(2, '0')
 
    var hours = time / h
    var hoursPart = pad(Math.floor(hours))

    var minutes = (time % h) / m
    var minutesPart = pad(Math.floor(minutes))

    var seconds = (time % h) % m

    var secondsPart = includeMilliseconds
      ? pad(seconds.toFixed(3))
      : pad(Math.round(seconds))

    return `${hoursPart}:${minutesPart}:${secondsPart}`
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

  updatePerformanceTuneName(sessionId: string, performanceId: string, tuneName: string) { log(arguments)()
    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

    var performance = this.data.findPerformance(performanceId)
    var tune = this.data.findTune(performance.tuneId)

    performance.tuneName = tuneName
    tune.name = tuneName

    this.$dispatch('sx:performance-updated', performance)
  },

  updateTuneName(tuneId: string, tuneName: string) { log(arguments)()
    if(this.pageState.page != 'tunes') {
      return
    }

    for(var performance of this.data.performancesForTune(tuneId)) {
      performance.tuneName = tuneName
      this.$dispatch('sx:performance-updated', performance)
    }
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

  deletePerformance(performanceId: string) { log(arguments)()
    this.data.deletePerformance(performanceId)
    
    if(this.pageState.page == 'session') {
      this.pageState.data.currentPerformance = undefined
    }

    this.$dispatch('sx:performance-deleted', performance)
  },

  deleteSession(sessionId: string) { log(arguments)()
    if(this.pageState.page != 'sessions') {
      return
    }

    this.data.deleteSession(sessionId)
  },

  deleteTune(tuneId: string) { log(arguments)()
    if(this.pageState.page != 'tunes') {
      return
    }

    this.data.deleteTune(tuneId)
  },

  changeTune(sessionId: string, performanceId: string, newTuneId: string) { log(arguments)()
    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

    this.data.changeTune(performanceId, newTuneId)

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
        this.loadSessions()
        this.sessionProgress = Object.fromEntries(this.data.sessions.map(s => [s.id, s.processed ? 100 : 0]))
      })
  },

  onPerformanceCreating(detail: {sessionId: string, startTime: number, endTime: number}) { log(arguments)()
    var sessionId = detail.sessionId
    var startTime = detail.startTime
    var endTime = detail.endTime

    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

    var performance = this.data.createPerformance(sessionId, startTime, endTime)

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
  },

  onSessionProgress(detail: {sessionId: string, progress: number}) { log(arguments)()
    var sessionId = detail.sessionId
    var progress = detail.progress

    if(this.pageState.page != 'sessions') {
      return
    }

    this.sessionProgress[sessionId] = progress
    if(progress == 100) {
      this.data.findSession(sessionId).processed = true;
    }
  }
}))

export default App