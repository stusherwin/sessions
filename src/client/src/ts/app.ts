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
  canBreakPrevious: boolean
  canBreakNext: boolean
}

type PageState = { page: 'sessions' } 
               | { page: 'tunes' } 
               | { page: 'session', data: Waveform } 
               | { page: 'tune', data: Tune }
               | { page: 'newSession' }
               | { page: 'backups' }

interface App {
  initialised: boolean
  data: AppDataManager
  pageState: PageState
  playing: boolean
  editing: string | undefined
  adding: boolean
  tuneMode: boolean
  fileUpload: string | undefined
  newSessionName: string | undefined
  taskProgress: { [taskId: string] : number; }

  init: () => void
  loadSession: (sessionId: string, sessionName: string) => void
  loadTune: (tuneId: string) => void
  loadSessions: () => void
  loadTunes: () => void
  loadNewSession: () => void
  loadBackups: () => void
  formatTime: (time: number) => string
  updateTuneName: (sessionId: string, tuneId: string, name: string) => void
  deletePerformance: (performanceId: string) => void
  skipToStart: () => void
  skipToEnd: () => void
  skipBackward: () => void
  skipForward: () => void
  nudgeBackward: () => void
  nudgeForward: () => void
  nudgeStartBackward: () => void
  nudgeStartForward: () => void
  nudgeEndBackward: () => void
  nudgeEndForward: () => void
  playPause: () => void
  zoomIn: () => void
  zoomOut: () => void
  toggleEditing: () => void
  toggleAdding: () => void
  toggleTuneMode: () => void
  splitCurrentTune: () => void
  changeCurrentTune: (sessionId: string, performanceId: string) => void
  changeTune: (sessionId: string, performanceId: string, newTuneId: string) => void
  uploadFile: (form: HTMLFormElement) => void
  uploadBackup: (form: HTMLFormElement) => void
  restoreBackup: (form: HTMLFormElement, backupId: string) => void
  createBackup: (form: HTMLFormElement) => void
  onPerformanceCreating: (detail: {sessionId: string, startTime: number, endTime: number}) => void
  onPerformanceUpdating: (detail: {sessionId: string, performanceId: string, startTime: number, endTime: number}) => void
  onCurrentPerformanceChanged: (detail: {sessionId: string, performanceId: string | undefined, canBreakPrevious: boolean, canBreakNext: boolean}) => void
  formatDate: (date: Date) => string
}

const App = defineComponent<unknown, App>(() => ({
  initialised: false,
  data: new AppDataManager, 
  pageState: { page: 'sessions' } as PageState,
  playing: false,
  editing: undefined,
  adding: false,
  tuneMode: false,
  fileUpload: undefined,
  newSessionName: undefined,
  taskProgress: {},

  init() { log(arguments)()
    this.initialised = true
    this.data.load(() => {
      var sessionTasks = this.data.sessions.map(s => [s.id, s.processed ? 100 : 0]);
      var backupTasks = this.data.backups.map(s => [s.id, s.processed ? 100 : 0]);
      this.taskProgress = Object.fromEntries([...sessionTasks, ...backupTasks])
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
        currentPerformance: undefined,
        canBreakNext: false,
        canBreakPrevious: false
      }
    }
    this.editing = undefined
    this.adding = false

    var performances = this.data.performances.filter(p => p.sessionId == sessionId)
    this.$dispatch('sx:waveform-loading', { session, performances, performanceId })
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
    this.editing = undefined
    this.adding = false
  },

  loadSessions() { log(arguments)()
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.session.id)
    }

    this.pageState = {
      page: 'sessions'
    }
    this.editing = undefined
    this.adding = false
  },

  loadTunes() { log(arguments)()
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.session.id)
    }

    this.pageState = {
      page: 'tunes'
    }
    this.editing = undefined
    this.adding = false
  },

  loadNewSession() { log(arguments)()
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.session.id)
    }

    this.pageState = {
      page: 'newSession'
    }
    this.editing = undefined
    this.adding = false
  },

  loadBackups() { log(arguments)()
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.session.id)
    }

    this.pageState = {
      page: 'backups'
    }
    this.editing = undefined
    this.adding = false
  },

  formatTime(time: number, includeMilliseconds: boolean = false) {
    const h = 60.0 * 60.0
    const m = 60.0
    const pad = (n: any, p: number) => n.toString().padStart(p, '0')
 
    var hours = time / h
    var hoursPart = hours > 1 ? Math.floor(hours) + ':' : ''

    var minutes = (time % h) / m
    var minutesPart = pad(Math.floor(minutes), 2) + ':'

    var seconds = (time % h) % m

    var secondsPart = includeMilliseconds
      ? pad(seconds.toFixed(3), 6)
      : pad(Math.round(seconds), 2)

    return `${hoursPart}${minutesPart}${secondsPart}`
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

  nudgeForward() { log(arguments)()
    this.$dispatch('sx:nudge-forward')
  },

  nudgeBackward() { log(arguments)()
    this.$dispatch('sx:nudge-backward')
  },

  breakFromPrevious() { log(arguments)()
    this.$dispatch('sx:break-from-previous')
  },

  breakFromNext() { log(arguments)()
    this.$dispatch('sx:break-from-next')
  },

  nudgeStartBackward() { log(arguments)()
    this.$dispatch('sx:nudge-start-backward')
  },

  nudgeStartForward() { log(arguments)()
    this.$dispatch('sx:nudge-start-forward')
  },

  nudgeEndBackward() { log(arguments)()
    this.$dispatch('sx:nudge-end-backward')
  },

  nudgeEndForward() { log(arguments)()
    this.$dispatch('sx:nudge-end-forward')
  },

  playPause() { log(arguments)()
    this.playing = !this.playing
    if(this.playing) {
        this.$dispatch('sx:playing-start')
    } else {
        this.$dispatch('sx:playing-stop')
    }
  },

  zoomIn() { log(arguments)()
    this.$dispatch('sx:zoom-in')
  },

  zoomOut() { log(arguments)()
    this.$dispatch('sx:zoom-out')
  },

  toggleEditing() { log(arguments)()
    if(this.pageState.page != 'session') {
      return
    }

    if(!this.editing) {
      this.editing = this.pageState.data.currentPerformance
    } else {
      this.editing = undefined
    }
    if(this.editing) {
      this.$dispatch('sx:editing-start', this.editing)
    } else {
      this.$dispatch('sx:editing-stop')
      this.adding = false
      this.$dispatch('sx:adding-stop')
    }
  },

  toggleAdding() { log(arguments)()
    this.adding = !this.adding
    if(this.adding) {
      this.$dispatch('sx:adding-start')
    } else {
      this.$dispatch('sx:adding-stop')
    }
  },

  toggleTuneMode() { log(arguments)()
    this.tuneMode = !this.tuneMode
    if(this.tuneMode) {
        this.$dispatch('sx:tune-mode-start')
    } else {
        this.$dispatch('sx:tune-mode-stop')
    }
  },

  splitCurrentTune() { log(arguments)()
    this.$dispatch('sx:split-current-tune')
  },

  changeCurrentTune(sessionId: string, performanceId: string) { log(arguments)()
    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

    this.$dispatch('sx:change-current-tune', performanceId)
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
    var performance = this.data.findPerformance(performanceId)
    if(!performance) {
      return
    }

    this.data.deletePerformance(performanceId)
    
    if(this.pageState.page == 'session') {
      this.pageState.data.currentPerformance = undefined
    }

    this.$dispatch('sx:performance-deleted', performance)
    
    if(this.editing) {
      this.toggleEditing()
    } else if(this.adding) {
      this.toggleAdding()
    }
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
        var sessionTasks = this.data.sessions.map(s => [s.id, s.processed ? 100 : 0]);
        var backupTasks = this.data.backups.map(s => [s.id, s.processed ? 100 : 0]);
        this.taskProgress = Object.fromEntries([...sessionTasks, ...backupTasks])
      })
  },

  uploadBackup(form: HTMLFormElement) { log(arguments)()
    var formData = new FormData()
    
    var inputs = form.getElementsByTagName('input')
    
    for(var input of inputs) {
      if(input.files && input.files.length) {
        formData.append(input.name, input.files[0])
      } else {
        formData.append(input.name, input.value)
      }
    }

    this.data.uploadBackup(formData)
      .then(() => {
        this.fileUpload = undefined
        this.newSessionName = undefined
        this.loadBackups()
        var sessionTasks = this.data.sessions.map(s => [s.id, s.processed ? 100 : 0]);
        var backupTasks = this.data.backups.map(s => [s.id, s.processed ? 100 : 0]);
        this.taskProgress = Object.fromEntries([...sessionTasks, ...backupTasks])
      })
  },

  restoreBackup(form: HTMLFormElement, backupId: string) { log(arguments)()
    var formData = new FormData()
    
    var inputs = form.getElementsByTagName('input')
    
    for(var input of inputs) {
      if(input.files && input.files.length) {
        formData.append(input.name, input.files[0])
      } else {
        formData.append(input.name, input.value)
      }
    }

    this.data.restoreBackup(formData, backupId)
      .then(() => {
        this.fileUpload = undefined
        this.newSessionName = undefined
        var backup = this.data.findBackup(backupId)
        backup.processed = false
        var sessionTasks = this.data.sessions.map(s => [s.id, s.processed ? 100 : 0]);
        var backupTasks = this.data.backups.map(s => [s.id, s.processed ? 100 : 0]);
        this.taskProgress = Object.fromEntries([...sessionTasks, ...backupTasks])
      })
  },

  createBackup(form: HTMLFormElement) { log(arguments)()
    var formData = new FormData()
    
    var inputs = form.getElementsByTagName('input')
    
    for(var input of inputs) {
      if(input.files && input.files.length) {
        formData.append(input.name, input.files[0])
      } else {
        formData.append(input.name, input.value)
      }
    }

    this.data.createBackup(formData)
      .then(() => {
        this.fileUpload = undefined
        this.newSessionName = undefined
        this.loadBackups()
        var sessionTasks = this.data.sessions.map(s => [s.id, s.processed ? 100 : 0]);
        var backupTasks = this.data.backups.map(s => [s.id, s.processed ? 100 : 0]);
        this.taskProgress = Object.fromEntries([...sessionTasks, ...backupTasks])
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

  onCurrentPerformanceChanged(detail: {sessionId: string, performanceId: string | undefined, canBreakPrevious: boolean, canBreakNext: boolean}) { log(arguments)()
    var sessionId = detail.sessionId
    var performanceId = detail.performanceId
    var canBreakNext = detail.canBreakNext
    var canBreakPrevious = detail.canBreakPrevious

    if(this.pageState.page != 'session' || this.pageState.data.session.id != sessionId) {
      return
    }

    this.pageState.data.currentPerformance = performanceId
    this.pageState.data.canBreakNext = canBreakNext
    this.pageState.data.canBreakPrevious = canBreakPrevious
    
    if(this.editing) {
      this.toggleEditing()
    } else if(this.adding) {
      this.toggleAdding()
    }
  },

  onTaskProgress(detail: {taskId: string, percentComplete: number}) { log(arguments)()
    var taskId = detail.taskId
    var progress = detail.percentComplete

    this.taskProgress[taskId] = progress
    log(this.taskProgress)();
    if(progress == 100) {
      this.data.load();
    }
  },

  formatDate(date: Date) { log(arguments)()
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    var month = months[date.getMonth() - 1]
    return `${date.getDate().toString().padStart(2, '0')} ${month} ${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
  }
}))

export default App