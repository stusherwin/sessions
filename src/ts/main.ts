import Alpine from 'alpinejs'
import persist from '@alpinejs/persist'
import '../scss/styles.scss'
import iconsRaw from 'bootstrap-icons/bootstrap-icons.svg?raw'
import WaveSurfer from 'wavesurfer.js'
import type { Region } from 'wavesurfer.js/dist/plugins/regions.esm.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import EventEmitter from './event-emitter'
import type { AlpineComponent } from 'alpinejs'

export const defineComponent = <P, T>(fn: (params: P) => AlpineComponent<T>) => fn

const dispatch = (e: string, detail: any) =>
  dispatchEvent(new CustomEvent(e, { detail }))

function listen<T>(e: string, handler : (arg: T) => void) : () => void {
  var listener : EventListener = ((e: CustomEventInit<T>) => {
    if(!e.detail) {
      return;
    }
    handler(e.detail)
  })
  window.addEventListener(e, listener)
  return () => window.removeEventListener(e, listener)
}

var allSvg = document.getElementById('all')
if(allSvg) {
  allSvg.innerHTML = iconsRaw;
}

window.Alpine = Alpine
Alpine.plugin(persist)

interface Waveform {
  ready: boolean
  loading: number
  sessionId: string
  sessionName: string
}

interface AppData {
  sessions: Session[]
  tunes: Tune[]
}

interface Session {
  id: string,
  name: string,
  filename: string,
  peaks: number[][] | undefined,
  duration: number | undefined,
  tunes: TunePerformance[]
}

interface Tune {
  id: string
  name: string
  performances: TunePerformance[]
}

interface TunePerformance {
  tuneId: string
  tuneName: string
  sessionId: string
  sessionName: string
  startTime: number
  endTime: number
}

interface App {
  sessions: Session[] 
  tunes: Tune[]
  pageState: { page: 'sessions' } | { page: 'tunes' } | { page: 'session', data: Waveform } | { page: 'tune', data: Tune }
  // waveform: Waveform | undefined
  // page: 'sessions' | 'tunes' | 'session'
  // currentTune: Tune | undefined

  init: () => void
  loadSession: (sessionId: string, sessionName: string) => void
  createTune: (sessionId: string, startTime: number, endTime: number) => void
}

const App = defineComponent<unknown, App>(() => ({ 
  sessions: [], 
  tunes: [], 
  pageState: { page: 'sessions' },

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

  loadSession(sessionId: string, sessionName: string) {
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.sessionId)
    }

    this.pageState = {
      page: 'session',
      data: {
        sessionId,
        sessionName,
        ready: false,
        loading: 0
      }
    }

    var session = this.sessions.find(s => s.id == sessionId)
    if(session) {
      this.$dispatch('sx:waveform-loading', session)
    }
  },

  loadTune(tune: Tune) {
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.sessionId)
    }

    this.pageState = {
      page: 'tune',
      data: tune
    }
  },

  loadSessions() {
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.sessionId)
    }

    this.pageState = {
      page: 'sessions'
    }
  },

  loadTunes() {
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.sessionId)
    }

    this.pageState = {
      page: 'tunes'
    }
  },

  createTune(sessionId: string, startTime: number, endTime: number) {
    var session = this.sessions.find(s => s.id == sessionId)

    var nextTuneId = this.tunes.length + 1
    var tuneId = 'tune-' + nextTuneId
    var tuneName = 'Tune ' + nextTuneId

    var perf : TunePerformance = {
      tuneId,
      tuneName,
      sessionId,
      sessionName: session && session.name || '',
      startTime,
      endTime
    }

    var tune : Tune = {
      id: tuneId,
      name: tuneName,
      performances: [perf]
    }

    this.tunes.push(tune)
    session?.tunes.push(perf)

    this.$dispatch('sx:tune-created', perf)
  }
}))

document.addEventListener('alpine:init', () => {
  Alpine.data('app', App)
})

Alpine.start()


class WaveformManager {
  session: Session
  tuneRegions: TuneRegionManager
  ws: WaveSurfer
  subscriptions: (() => void)[] = []

  constructor(session: Session) {
    this.session = session

    const subscribe = (unsubscribe: () => void) => this.subscriptions.push(unsubscribe)

    var regions = RegionsPlugin.create()
    this.tuneRegions = new TuneRegionManager(session.tunes, regions)

    subscribe(this.tuneRegions.on('tune-region-creating', (startTime, endTime) => 
      dispatch('sx:tune-creating', { sessionId: this.session.id, startTime, endTime })))

    subscribe(this.tuneRegions.on('tune-region-created', (startTime, _) => 
      this.ws.setTime(startTime)))

    this.ws = WaveSurfer.create({
      container: '.waveform[data-session-id="' + session.id + '"]',
      waveColor: 'black',
      progressColor: 'black',
      cursorColor: 'red',
      url: '/' + this.session.filename,
      plugins: [regions],
      peaks: this.session.peaks,
      duration: this.session.duration
    })

    subscribe(this.ws.on('loading', percent => 
      dispatch('sx:waveform-load-progress-updated', { id: this.session.id, loading: percent })))

    subscribe(this.ws.once('decode', () => {
      this.tuneRegions.init()

      dispatch('sx:waveform-ready', { id: this.session.id })
    }))
    
    subscribe(listen('sx:tune-created', (tune: TunePerformance) => {
      if(tune.sessionId != this.session.id) {
        return
      }

      this.tuneRegions.create(tune)
    }))
  }

  unload() {
    for(var unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions = [];
    this.tuneRegions.unload()
    this.ws.destroy();
  }
}

declare global {
  interface Window { 
    waveform: WaveformManager | undefined
  }
}
window.waveform = undefined

listen('sx:waveform-loading', (session: Session) =>
  setTimeout(() => {
    window.waveform = new WaveformManager(session)
  }))

listen('sx:waveform-unloading', (sessionId: string) => {
  if(window.waveform && window.waveform.session.id == sessionId) {
    window.waveform.unload()
  }
})

class TuneRegionManager extends EventEmitter<TuneRegionManagerEvents> {
  regions: RegionsPlugin
  tunes: TuneRegionCollection
  creating: boolean = false
  subscriptions: (() => void)[] = []
  disableDragSelection : (() => void) | undefined = undefined

  constructor(tunes: TunePerformance[], regions: RegionsPlugin) {
    super()
 
    this.regions = regions
    this.tunes = new TuneRegionCollection(tunes)
  }

  init() {
    this.disableDragSelection = this.regions.enableDragSelection({
      // color: 'rgba(206.6, 226, 254.6, 0.5)',
      drag: false
    })

    for(var tune of this.tunes) {
      var region = this.regions.addRegion({ 
        id: tune.tuneId, 
        content: tune.tuneName, 
        start: tune.startTime, 
        end: tune.endTime, 
        drag: false, 
        resize: false 
      })
      region.element?.part.add('sx-tune')
      if(tune.prevNeighbour && tune.prevNeighbour.locked) {
        region.element?.part.add('sx-locked-left')
      }
      if(tune.nextNeighbour && tune.nextNeighbour.locked) {
        region.element?.part.add('sx-locked-right')
      }
    }
    
    const subscribe = (unsubscribe: () => void) => this.subscriptions.push(unsubscribe)

    subscribe(this.regions.on('region-initialized', r => this.onRegionInitialized(r)))
    subscribe(this.regions.on('region-created', r => this.onRegionCreated(r)))
  }

  unload() {
    for(var unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions = [];
  }

  findRegion(regionId: string) : Region | undefined {
    if(!this.regions) {
        return
    }

    return this.regions.getRegions().find((r, _) => r.id == regionId)
  }

  onRegionInitialized(region: Region) {
    // different colour for creating tune
    region.setOptions({ id : 'creating' })
    this.creating = true

    var el = region.element
    if(el) {
      el.part.add('sx-editable')
      for(var child of el.children) {
        child.part.add('sx-editable')
      }
    }
  }

  onRegionCreated(region: Region) {
    if(this.disableDragSelection) {
      this.disableDragSelection()
    }

    var tune = this.tunes.tryCreate(region.start, region.end)
    if(!tune) {
      region.remove()
      this.creating = false
      this.disableDragSelection = this.regions.enableDragSelection({
        // color: 'rgba(206.6, 226, 254.6, 0.5)',
        drag: false
      })
      return
    }

    this.emit('tune-region-creating', tune.startTime, tune.endTime)
  }
  
  create(perf: TunePerformance) {
    var region = this.findRegion("creating")

    if(!region) {
      this.creating = false
      this.disableDragSelection = this.regions.enableDragSelection({
        // color: 'rgba(206.6, 226, 254.6, 0.5)',
        drag: false
      })
      return
    }

    var tune = this.tunes.add(perf)

    region.setOptions({ id : perf.tuneId, content: perf.tuneName, start: perf.startTime, end: perf.endTime })
    var el = region.element
    if(el) {
      el.part.add('sx-tune')
      // el.part.add('sx-editable')
      // for(var j = 0; j < el.children.length; j++) {
      //   el.children[j].part.add('sx-editable')
      // }
    }

    this.updateLockedState(region, tune)
    this.emit('tune-region-created', region.start, region.end)

    this.creating = false
    this.disableDragSelection = this.regions.enableDragSelection({
      // color: 'rgba(206.6, 226, 254.6, 0.5)',
      drag: false
    })
  }

  updateLockedState(region : Region, tune: TuneRegion) {
    var el = region.element
    if(el) {
      el.part.add('sx-tune')
      // el.part.add('sx-editable')
      // for(var j = 0; j < el.children.length; j++) {
      //   el.children[j].part.add('sx-editable')
      // }
      if(tune.current) {
        el.part.add('sx-current')
      } else {
        el.part.remove('sx-current')
      }
    }

    function lock(region: Region | undefined, side: string) {
      region?.element?.part.add('sx-locked-' + side)
      var handle = region?.element?.querySelector('::part(region-handle-' + side + ')')
      handle?.part.add('sx-locked')
    }

    if(tune.prevNeighbour && tune.prevNeighbour.locked) {
      lock(region, 'left')
      var prev = this.findRegion(tune.prevNeighbour.tune.tuneId)
      lock(prev, 'right')
    }

    if(tune.nextNeighbour && tune.nextNeighbour.locked) {
      lock(region, 'right')
      var next = this.findRegion(tune.nextNeighbour.tune.tuneId)
      lock(next, 'left')
    }
  }
}

class TuneRegionCollection {
  tunes: TuneRegion[] = []

  constructor(tunes: TunePerformance[]) {
    this.tunes = tunes.map(t => new TuneRegion(t.tuneId, t.tuneName, t.startTime, t.endTime))
    
    this.lockNeighbours()
  }

  [Symbol.iterator](): ArrayIterator<TuneRegion> {
    return this.tunes[Symbol.iterator]()
  }

  tryCreate(startTime: number, endTime: number) : {startTime: number, endTime: number} | undefined {
    for(var tune of this.tunes) {
      if(startTime < tune.startTime && tune.endTime < endTime) {
        return;
      }
    }

    for(var tune of this.tunes) {
      //       [ A ]       [ B ]
      // <-1->
      if(startTime < tune.startTime && endTime < tune.startTime) {
        break
      }

      //       [ A ]       [ B ]
      //     <-2->      
      if(startTime < tune.startTime && tune.startTime < endTime && endTime < tune.endTime) {
        endTime = tune.startTime
        break
      }

      //       [ A ]       [ B ]
      //         <-3->
      if(tune.startTime < startTime && startTime < tune.endTime && tune.endTime < endTime) {
        startTime = tune.endTime
        break
      }
    }

    return { startTime, endTime }
  }

  add(perf: TunePerformance) : TuneRegion {
    var newTune =  new TuneRegion(perf.tuneId, perf.tuneName, perf.startTime, perf.endTime)

    if(!this.tunes.length) {
      this.tunes = [newTune]
      return newTune;
    }

    var tunes = []
    var pushed = false
    
    for(var tune of this.tunes) {
      if(!pushed && newTune.startTime < tune.startTime) {
        tunes.push(newTune)
        pushed = true
      }
      tunes.push(tune)
    }

    if(!pushed) {
      tunes.push(newTune)
    }

    this.tunes = tunes
    this.lockNeighbours()

    return newTune
  }

  lockNeighbours() {
    for(var i = 1; i < this.tunes.length; i++) {
      let prevTune = this.tunes[i - 1]
      let tune = this.tunes[i]

      var locked = prevTune.endTime == tune.startTime
      prevTune.nextNeighbour = new TuneRegionNeighbour(tune, locked)
      tune.prevNeighbour = new TuneRegionNeighbour(prevTune, locked)
    }    
  }
}

class TuneRegion {
  tuneId: string
  tuneName: string
  startTime: number
  endTime: number
  current: boolean = false
  prevNeighbour: TuneRegionNeighbour | undefined = undefined
  nextNeighbour: TuneRegionNeighbour | undefined = undefined

  constructor(tuneId: string, tuneName: string, startTime: number, endTime: number) {
    this.tuneId = tuneId
    this.tuneName = tuneName
    this.startTime = startTime
    this.endTime = endTime
  }
}

class TuneRegionNeighbour {
  tune: TuneRegion
  locked: boolean

  constructor(tune: TuneRegion, locked: boolean) {
    this.tune = tune
    this.locked = locked
  }
}

type TuneRegionManagerEvents = {
  'tune-region-creating': [number, number]
  'tune-region-created': [number, number]
}