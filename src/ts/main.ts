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

var delta = 5;
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
  tunes: TunePerformance[]
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
  playing: boolean
  editing: boolean

  init: () => void
  loadSession: (sessionId: string, sessionName: string) => void
  createTune: (sessionId: string, startTime: number, endTime: number) => void
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

  loadSession(sessionId: string, sessionName: string) {
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
        sessionName,
        ready: false,
        loading: 0,
        tunes: session.tunes
      }
    }
    this.editing = false

    this.$dispatch('sx:waveform-loading', session)
  },

  loadTune(tune: Tune) {
    if(this.pageState.page == 'session') {
      this.$dispatch('sx:waveform-unloading', this.pageState.data.sessionId)
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

document.addEventListener('alpine:init', () => {
  Alpine.data('app', App)
})

Alpine.start()


class WaveformManager {
  session: Session
  tuneRegions: TuneRegionManager
  ws: WaveSurfer
  subscriptions: (() => void)[] = []
  zoomTimeout :  number | undefined = undefined
  zooming = false
  editing = false
  scrollPosition: number | undefined = undefined
  container: HTMLElement

  constructor(session: Session) {
    this.session = session

    const subscribe = (unsubscribe: () => void) => this.subscriptions.push(unsubscribe)

    var regions = RegionsPlugin.create()
    this.tuneRegions = new TuneRegionManager(session.tunes, regions)

    subscribe(this.tuneRegions.on('tune-region-creating', (startTime, endTime) => 
      dispatch('sx:tune-creating', { sessionId: this.session.id, startTime, endTime })))

    subscribe(this.tuneRegions.on('tune-region-created', (startTime, _) => 
      this.ws.setTime(startTime)))

    subscribe(this.tuneRegions.on('tune-region-updating', (tuneId, startTime, endTime) => 
      dispatch('sx:tune-updating', { sessionId: this.session.id, tuneId, startTime, endTime })))

    subscribe(this.tuneRegions.on('tune-region-updated', (tuneId, startTime, endTime) => {}))

    this.container = document.querySelector('.waveform[data-session-id="' + session.id + '"]') as HTMLElement
    this.ws = WaveSurfer.create({
      container: this.container,
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
    
    subscribe(listen('sx:tune-updated', (tune: TunePerformance) => {
      if(tune.sessionId != this.session.id) {
        return
      }

      this.tuneRegions.update(tune)
    }))
    
    subscribe(listen('sx:tune-name-updated', (tune: TunePerformance) => {
      if(tune.sessionId != this.session.id) {
        return
      }

      this.tuneRegions.updateName(tune)
    }))

    subscribe(this.ws.on('play', () => dispatch('sx:playing', {})))
    subscribe(this.ws.on('pause', () => dispatch('sx:stopped', {})))
    subscribe(this.ws.on('finish', () => dispatch('sx:stopped', {})))
    subscribe(listen('sx:play-pause', () => this.playPause()))
    subscribe(listen('sx:play-from-start', () => this.playFromStart()))
    subscribe(listen('sx:skip-to-start', () => this.skipToStart()))
    subscribe(listen('sx:skip-to-end', () => this.skipToEnd()))
    subscribe(listen('sx:skip-backward', () => this.skipBackward()))
    subscribe(listen('sx:skip-forward', () => this.skipForward()))
    subscribe(listen('sx:zoom-in', () => this.zoomIn()))
    subscribe(listen('sx:zoom-out', () => this.zoomOut()))
    subscribe(listen('sx:editing-start', () => this.startEditing()))
    subscribe(listen('sx:editing-stop', () => this.stopEditing()))
  }

  unload() {
    for(var unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions = [];
    this.tuneRegions.unload()
    this.ws.destroy();
  }

  playPause() {
    this.ws.playPause();
  }

  playFromStart() {
    this.ws.setTime(0);
    this.ws.play();
  }

  skipToStart() {
    this.ws.setTime(0);
  }

  skipToEnd() {
    this.ws.seekTo(1);
  }

  skipBackward() {
    let tune = this.tuneRegions.findPrevious(this.ws.getCurrentTime());
    if(tune) {
      this.ws.setTime(tune.startTime + 0.00000001);
    }
  }

  skipForward() {
    let tune = this.tuneRegions.findNext(this.ws.getCurrentTime());
    if(tune) {
      this.ws.setTime(tune.startTime + 0.00000001);
    }
  }

  zoomIn() {
    if(!this.ws) {
        return
    }

    var currentScroll = this.ws.getScroll()
    var total = this.ws.getWrapper().scrollWidth
    var mid = currentScroll + this.ws.getWidth() / 2
    var percent = (mid / total)
    var width = Math.floor(this.container.getBoundingClientRect().width || Number.MAX_VALUE)
    var duration = this.ws.getDuration()
    var zoomedOut = width / duration
    var currentLevel = this.ws.options.minPxPerSec == 0 ? zoomedOut : this.ws.options.minPxPerSec
    var targetLevel = Math.min(width, currentLevel * 2)
    this.zooming = true
    clearTimeout(this.zoomTimeout)
    this.ws.zoom(targetLevel)
    var newTotal = this.ws.getWrapper().scrollWidth
    var newMid = percent * newTotal
    var newScroll = newMid - this.ws.getWidth() / 2
    if(this.editing) {
      this.scrollPosition = newScroll
    }
    this.ws.setScroll(newScroll)
    this.zoomTimeout = setTimeout(() => this.zooming = false, 1000)
  }

  zoomOut() {
    if(!this.ws) {
        return
    }

    var currentScroll = this.ws.getScroll()
    var total = this.ws.getWrapper().scrollWidth
    var mid = currentScroll + this.ws.getWidth() / 2
    var percent = (mid / total)
    var width = Math.floor(this.container.getBoundingClientRect().width || Number.MAX_VALUE)
    var duration = this.ws.getDuration()
    var zoomedOut = width / duration
    var currentLevel = this.ws.options.minPxPerSec == 0 ? zoomedOut : this.ws.options.minPxPerSec
    var targetLevel = Math.max(zoomedOut, currentLevel / 2)
    this.zooming = true
    clearTimeout(this.zoomTimeout)
    this.ws.zoom(targetLevel)
    var newTotal = this.ws.getWrapper().scrollWidth
    var newMid = percent * newTotal
    var newScroll = newMid - this.ws.getWidth() / 2
    if(this.editing) {
      this.scrollPosition = newScroll
    }
    this.ws.setScroll(newScroll)
    this.zoomTimeout = setTimeout(() => this.zooming = false, 1000)
  }

  startEditing() {
    this.editing = true
    this.scrollPosition = this.ws.getScroll()

    this.ws.setOptions({
      autoScroll: false,
      waveColor: 'white',
      progressColor: 'white',
      cursorColor: 'red'
    })

    this.container.classList.add('inverted')
    var parent = this.ws.getWrapper().parentElement
    if(parent) {
      parent.style.overflowX = 'hidden'
    }

    this.tuneRegions.startEditing()
  }

  stopEditing() {
    this.tuneRegions.stopEditing()

    this.ws.setOptions({
      autoScroll: true,
      waveColor: 'black',
      progressColor: 'black',
      cursorColor: 'red'
    })

    this.container.classList.remove('inverted')
    var parent = this.ws.getWrapper().parentElement
    if(parent) {
      parent.style.overflowX = 'auto'
    }

    this.scrollPosition = undefined
    this.editing = false
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
    // this.disableDragSelection = this.regions.enableDragSelection({
    //   // color: 'rgba(206.6, 226, 254.6, 0.5)',
    //   drag: false
    // })

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
    subscribe(this.regions.on('region-update', r => this.regionUpdate(r)))
    subscribe(this.regions.on('region-updated', r => this.regionUpdated(r)))
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

  findNext(time: number) : TuneRegion | undefined {
    for(var tune of this.tunes) {
      if(tune.startTime > time) {
        return tune
      }
    }
  }

  findPrevious(time: number) : TuneRegion | undefined {
    for(var tune of this.tunes.reversed()) {
      if(tune.startTime < time - delta) {
        return tune
      }
    }
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
      el.part.add('sx-editable')
      for(var j = 0; j < el.children.length; j++) {
        el.children[j].part.add('sx-editable')
      }
    }

    this.updateLockedState(region, tune)
    this.emit('tune-region-created', region.start, region.end)

    this.creating = false
    this.disableDragSelection = this.regions.enableDragSelection({
      // color: 'rgba(206.6, 226, 254.6, 0.5)',
      drag: false
    })
  }

  regionUpdate(region: Region) {
    let tune = this.tunes.find(region.id);

    if(!tune) {
      return
    }

    tune.update(region.start, region.end)
    region.setOptions({ start: tune.startTime, end: tune.endTime })

    this.updateLockedState(region, tune)

    if(tune.prevNeighbour) {
      var prevRegion = this.findRegion(tune.prevNeighbour.tune.tuneId)
      prevRegion?.setOptions({ start: tune.prevNeighbour.tune.startTime, end: tune.prevNeighbour.tune.endTime })
      this.updateLockedState(prevRegion, tune.prevNeighbour?.tune)
    }

    if(tune.nextNeighbour) {
      var nextRegion = this.findRegion(tune.nextNeighbour.tune.tuneId)
      nextRegion?.setOptions({ start: tune.nextNeighbour.tune.startTime, end: tune.nextNeighbour.tune.endTime })
      this.updateLockedState(nextRegion, tune.nextNeighbour?.tune)
    }
  }

  regionUpdated(region: Region) {
    let tune = this.tunes.find(region.id);

    if(!tune) {
      return
    }

    tune.lockNeighbours()
    this.updateLockedState(region, tune)
    this.emit('tune-region-updating', tune.tuneId, tune.startTime, tune.endTime)

    if(tune.prevNeighbour) {
      var prevRegion = this.findRegion(tune.prevNeighbour.tune.tuneId)
      this.updateLockedState(prevRegion, tune.prevNeighbour?.tune)
      this.emit('tune-region-updating', tune.prevNeighbour.tune.tuneId, tune.prevNeighbour.tune.startTime, tune.prevNeighbour.tune.endTime)
    }

    if(tune.nextNeighbour) {
      var nextRegion = this.findRegion(tune.nextNeighbour.tune.tuneId)
      this.updateLockedState(nextRegion, tune.nextNeighbour?.tune)
      this.emit('tune-region-updating', tune.nextNeighbour.tune.tuneId, tune.nextNeighbour.tune.startTime, tune.nextNeighbour.tune.endTime)
    }
  }

  updateName(perf: TunePerformance) {
    let region = this.findRegion(perf.tuneId)
    let tune = this.tunes.find(perf.tuneId);

    if(!region || !tune) {
      return
    }

    region.setContent(perf.tuneName || '')
    tune.updateName(perf.tuneName)
  }

  update(perf: TunePerformance) {
  }

  updateLockedState(region : Region | undefined, tune: TuneRegion) {
    var el = region?.element
    if(el) {
      el.part.add('sx-tune')
      el.part.add('sx-editable')
      for(var j = 0; j < el.children.length; j++) {
        el.children[j].part.add('sx-editable')
      }
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

  startEditing() {
    this.disableDragSelection = this.regions.enableDragSelection({
      // color: 'rgba(206.6, 226, 254.6, 0.5)',
      drag: false
    })

    var rs = this.regions.getRegions()
    for(var i = 0; i < rs.length; i++) {
        // console.log(rs[1])
        rs[i].setOptions({resize: true})
    //   rs[i].resize = true
      var el = rs[i].element
      if(el) {
        el.part.add('sx-editable')
        for(var j = 0; j < el.children.length; j++) {
          el.children[j].part.add('sx-editable')
        }
      }
    }
  }

  stopEditing() {
    var rs = this.regions.getRegions()
    for(var i = 0; i < rs.length; i++) {
        rs[i].setOptions({resize: false})

    //   rs[i].resize = false
      var el = rs[i].element
      if(el) {
        el.part.remove('sx-editable')
        for(var j = 0; j < el.children.length; j++) {
          el.children[j].part.remove('sx-editable')
        }
      }
    }

    if(this.disableDragSelection) {
      this.disableDragSelection()
      this.disableDragSelection = undefined
    }
  }
}

class TuneRegionCollection {
  tunes: TuneRegion[] = []

  constructor(tunes: TunePerformance[]) {
    this.tunes = tunes
      .map(t => new TuneRegion(t.tuneId, t.tuneName, t.startTime, t.endTime))
      .sort((a, b) => a.startTime - b.startTime)
    
    this.lockNeighbours()
  }

  [Symbol.iterator](): ArrayIterator<TuneRegion> {
    return this.tunes[Symbol.iterator]()
  }

  reversed() {
    var x = this.tunes
    return {
      *[Symbol.iterator]() {
        for(var i = x.length - 1; i >=0; i--) {
          yield x[i];
        }
      }
    }
  }

  find(id: string) : TuneRegion | undefined {
    return this.tunes.find(s => s.tuneId == id)
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

  updateName(name: string) {
    this.tuneName = name
  }

  update(startTime: number, endTime: number) {
    if(this.prevNeighbour) {
      if(this.prevNeighbour.locked) {
        this.prevNeighbour.tune.endTime = startTime
      } else {
        if(startTime < this.prevNeighbour.tune.endTime) {
          startTime = this.prevNeighbour.tune.endTime
        }
      }
    }

    if(this.nextNeighbour) {
      if(this.nextNeighbour.locked) {
        this.nextNeighbour.tune.startTime = endTime
      } else {
        if(this.nextNeighbour.tune.startTime < endTime) {
          endTime = this.nextNeighbour.tune.startTime
        }
      }
    }

    this.startTime = startTime
    this.endTime = endTime
  }

  lockNeighbours() {
    if(this.prevNeighbour && this.startTime == this.prevNeighbour.tune.endTime) {
      this.prevNeighbour.locked = true;
      this.prevNeighbour.tune.nextNeighbour = new TuneRegionNeighbour(this, true);
    }

    if(this.nextNeighbour && this.endTime == this.nextNeighbour.tune.startTime) {
      this.nextNeighbour.locked = true;
      this.nextNeighbour.tune.prevNeighbour = new TuneRegionNeighbour(this, true);
    }
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
  'tune-region-updating': [string, number, number]
  'tune-region-updated': [string, number, number]
}