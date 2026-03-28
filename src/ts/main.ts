import Alpine from 'alpinejs'
import persist from '@alpinejs/persist'
import '../scss/styles.scss'
import iconsRaw from 'bootstrap-icons/bootstrap-icons.svg?raw'
import WaveSurfer from 'wavesurfer.js'
import type { Region } from 'wavesurfer.js/dist/plugins/regions.esm.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'

var allSvg = document.getElementById('all')
if(allSvg) {
  allSvg.innerHTML = iconsRaw;
}

window.Alpine = Alpine
Alpine.plugin(persist)

interface WaveformData {
  ready: boolean
  loading: number
  sessionId: string
  sessionName: string
}

interface AppData {
  sessions: SessionData[]
  tunes: TuneData[]
}

interface SessionData {
  id: string,
  name: string,
  filename: string,
  peaks: number[][] | undefined,
  duration: number | undefined,
  tunes: TunePerformanceData[]
}

interface TuneData {
  id: string
  name: string
  performances: TunePerformanceData[]
}

interface TunePerformanceData {
  tuneId: string
  tuneName: string
  sessionId: string
  sessionName: string
  startTime: number
  endTime: number
}

document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({ 
    init() {
      console.log('init')
      window.fetch(new Request("/sessions.json"))
        .then((response) => {
            if(!response.ok) { 
                throw new Error('JSON file not found');
            }

            return response.json() as Promise<AppData>
        })
        .then((data : AppData) => {
            console.log(data)
            this.sessions = data.sessions
            this.tunes = data.tunes
        })
        .catch(err => {
            console.error(err)
        })
        .finally(() => {
        })
    },
    sessions: [] as SessionData[], 
    tunes: [] as TuneData[], 
    waveform: undefined as WaveformData | undefined,
    loadWaveform(sessionId: string, sessionName: string) {
      console.log(sessionId)
      console.log(sessionName)
      if(this.waveform) {
        this.waveform.ready = false
        this.waveform.loading = 0
        this.$dispatch('sx:unload-waveform', this.waveform.sessionId)
        this.waveform = undefined
      }

      this.waveform = {
        sessionId,
        sessionName,
        ready: false,
        loading: 0
      }

      this.$dispatch('sx:load-waveform', sessionId)
    },
    createTune(sessionId: string, startTime: number, endTime: number) {
      console.log('createTune')
      console.log(sessionId)
      console.log(startTime)
      console.log(endTime)
      var session : SessionData | undefined = undefined
      for(var s of this.sessions) {
        if(s.id == sessionId) {
          session = s
          break
        }
      }

      var nextTuneId = this.tunes.length + 1
      var tuneId = 'tune-' + nextTuneId
      var tuneName = 'Tune ' + nextTuneId
      var perf : TunePerformanceData = {
        tuneId,
        tuneName,
        sessionId,
        sessionName: session && session.name || '',
        startTime,
        endTime
      }
      var tune : TuneData = {
        id: tuneId,
        name: tuneName,
        performances: [perf]
      }
      this.tunes.push(tune)
      session?.tunes.push(perf)

      this.$dispatch('sx:tune-created', perf)
    }
  }))
})

Alpine.start()

class Session {
  id: string
  name: string
  filename: string
  peaks: number[][] | undefined
  duration: number | undefined
  tunes: TunePerformance[] = []
  constructor(data: SessionData) {
    this.id = data.id
    this.name = data.name
    this.filename = data.filename
    this.peaks = data.peaks
    this.duration = data.duration
    this.tunes = data.tunes.map(t => new TunePerformance(t.tuneId, t.tuneName, t.startTime, t.endTime))
    
    for(var i = 1; i < this.tunes.length; i++) {
      let prevTune = this.tunes[i - 1]
      let tune = this.tunes[i]

      var locked = prevTune.endTime == tune.startTime
      prevTune.nextNeighbour = new TunePerformanceNeighbour(tune, locked)
      tune.prevNeighbour = new TunePerformanceNeighbour(prevTune, locked)
    }
    console.log(this.tunes)
  }

  tryCreateTune(startTime: number, endTime: number) : boolean {
    console.log('tryCreateTune')
    console.log(startTime)
    console.log(endTime)

    if(!this.tunes.length) {
      window.dispatchEvent(new CustomEvent('sx:tune-creating', { detail: { sessionId: this.id, startTime, endTime } }))    
      return true
    }

    for(var i = 0; i < this.tunes.length; i++) {
      let tune = this.tunes[i]
      if(startTime < tune.startTime && tune.endTime < endTime) {
        return false;
      }
    }

    for(var i = 0; i < this.tunes.length; i++) {
      let tune = this.tunes[i]

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

    window.dispatchEvent(new CustomEvent('sx:tune-creating', { detail: { sessionId: this.id, startTime, endTime } }))    
    return true
  }

  addTune(perf: TunePerformanceData) : TunePerformance {
    console.log('addTune')
    console.log(perf)

    var newTune =  new TunePerformance(perf.tuneId, perf.tuneName, perf.startTime, perf.endTime)

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

    for(var i = 1; i < tunes.length; i++) {
      let prevTune = tunes[i - 1]
      let tune = tunes[i]

      var locked = prevTune.endTime == tune.startTime
      prevTune.nextNeighbour = new TunePerformanceNeighbour(tune, locked)
      tune.prevNeighbour = new TunePerformanceNeighbour(prevTune, locked)
    }

    this.tunes = tunes

    console.log(this.tunes)

    return newTune
  }
}

class TunePerformanceNeighbour {
  tune: TunePerformance
  locked: boolean

  constructor(tune: TunePerformance, locked: boolean) {
    this.tune = tune
    this.locked = locked
  }
}

export class TunePerformance {
  tuneId: string
  tuneName: string
  startTime: number
  endTime: number
  current: boolean = false
  prevNeighbour: TunePerformanceNeighbour | undefined = undefined
  nextNeighbour: TunePerformanceNeighbour | undefined = undefined

  constructor(tuneId: string, tuneName: string, startTime: number, endTime: number) {
    this.tuneId = tuneId
    this.tuneName = tuneName
    this.startTime = startTime
    this.endTime = endTime
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
      this.prevNeighbour.tune.nextNeighbour = new TunePerformanceNeighbour(this, true);
    }

    if(this.nextNeighbour && this.endTime == this.nextNeighbour.tune.startTime) {
      this.nextNeighbour.locked = true;
      this.nextNeighbour.tune.prevNeighbour = new TunePerformanceNeighbour(this, true);
    }
  }
}

class Waveform {
  session: Session
  containerSelector: string
  regions: RegionsPlugin | undefined
  ws: WaveSurfer | undefined
  creating: boolean = false
  subscriptions: (() => void)[] = []
  disableDragSelection : (() => void) | undefined = undefined

  constructor(session: Session) {
    this.containerSelector = '.waveform[data-session-id="' + session.id + '"]'
    this.session = session
  }

  load() {
    console.log(this.session.id + ': load waveform...')
    var timeout = setTimeout(() => {
      console.log(this.session.id + ': after timeout')
      console.log(this.containerSelector)
      var el = document.querySelector(this.containerSelector)
      console.log(el)
      console.log(this.session.peaks)
      this.regions = RegionsPlugin.create()
      this.ws = WaveSurfer.create({
          container: this.containerSelector,
          waveColor: 'black',
          progressColor: 'black',
          cursorColor: 'red',
          url: '/' + this.session.filename,
          plugins: [this.regions],
          peaks: this.session.peaks,
          duration: this.session.duration
      })

      this.subscriptions.push(this.ws.on('loading', percent => 
        dispatchEvent(new CustomEvent('sx:waveform-loading', { detail: { id: this.session.id, loading: percent } }))))

      this.subscriptions.push(this.ws.once('decode', () => {
        console.log('decode')
        if(!this.ws || !this.regions) {
            return
        }

        console.log(this.session.id + ': on decode')

        this.disableDragSelection = this.regions.enableDragSelection({
          // color: 'rgba(206.6, 226, 254.6, 0.5)',
          drag: false
        })

        dispatchEvent(new CustomEvent('sx:waveform-ready', { detail: { id: this.session.id } }))

        for(var i = 0; i < this.session.tunes.length; i++) {
          var tune = this.session.tunes[i];
          var prevTune = i > 0 ? this.session.tunes[i - 1] : undefined;
          var nextTune = i < this.session.tunes.length - 1 ? this.session.tunes[i + 1] : undefined;
          var region = this.regions.addRegion({ 
              id: tune.tuneId, 
              content: tune.tuneName, 
              start: tune.startTime, 
              end: tune.endTime, 
              drag: false, 
              resize: false 
          })
          console.log(tune)
          console.log(region)
          region.element?.part.add('sx-tune')
          if(prevTune && prevTune.endTime == tune.startTime) {
              region.element?.part.add('sx-locked-left')
          }
          if(nextTune && nextTune.startTime == tune.endTime) {
              region.element?.part.add('sx-locked-right')
          }
        }

        this.subscriptions.push(this.regions.on('region-initialized', r => this.regionInitialized(r)))
        this.subscriptions.push(this.regions.on('region-created', r => this.regionCreated(r)))
        var tuneCreatedHandler : EventListener = ((e: CustomEventInit<TunePerformanceData>) => {
          console.log('tuneCreatedHandler')
          console.log(e.detail)

          if(!e.detail) {
            return
          }
          this.tuneCreated(e.detail)
        })
        window.addEventListener('sx:tune-created', tuneCreatedHandler)
        this.subscriptions.push(() => window.removeEventListener('sx:tune-created', tuneCreatedHandler))
      }))

      clearTimeout(timeout)
    })
  }

  unload() {
    console.log(this.session.id + ': unload waveform...')
    for(var i = 0; i < this.subscriptions.length; i++) {
        this.subscriptions[i]();
    }
    this.subscriptions = [];
    if(!this.ws) {
        return
    }
    this.ws.destroy();
    this.ws = undefined;
  }

  findRegion(regionId: string) : Region | undefined {
    if(!this.regions) {
        return
    }

    return this.regions.getRegions().find((r, _) => r.id == regionId)
  }

  regionInitialized(region: Region) {
    console.log('regionInitialized')
    // different colour for creating tune
    region.setOptions({ id : 'creating' })
    this.creating = true

    var el = region.element
    if(el) {
      el.part.add('sx-editable')
      for(var j = 0; j < el.children.length; j++) {
        el.children[j].part.add('sx-editable')
      }
    }
  }

  regionCreated(region: Region) {
    console.log('regionCreated')
    console.log(region)
     
    if(!this.regions) {
        return
    }

    // window.dispatchEvent(new CustomEvent('sx:region-created', { detail: { start: region.start, end: region.end } }))    

    // set id to "creating"
    // prevent new regions being created while "creating" region exists 
    // if tune can be created raise event
    // listen for event with tune id/start/end
    // set id to tune id
    if(this.disableDragSelection) {
      this.disableDragSelection()
    }

    if(!this.session.tryCreateTune(region.start, region.end)) {
      region.remove()
      this.creating = false
      this.disableDragSelection = this.regions.enableDragSelection({
        // color: 'rgba(206.6, 226, 254.6, 0.5)',
        drag: false
      })
      return
    }

    // region.setOptions({ id : tune.id, content: tune.tuneName, start: tune.startTime, end: tune.endTime })
    // var el = region.element
    // if(el) {
    //   el.part.add('sx-tune')
    //   el.part.add('sx-editable')
    //   for(var j = 0; j < el.children.length; j++) {
    //     el.children[j].part.add('sx-editable')
    //   }
    // }

    // this.updateLockedState(region, tune)

    // this.ws.setTime(region.start);
  }

  tuneCreated(perf: TunePerformanceData) {
    console.log('tuneCreated')
    console.log(perf)

    if(!this.ws) {
        return
    }

    if(!this.regions) {
        return
    }

    if(perf.sessionId != this.session.id) {
      return
    }

    var region = this.findRegion("creating")

    if(!region) {
      this.creating = false
      this.disableDragSelection = this.regions.enableDragSelection({
        // color: 'rgba(206.6, 226, 254.6, 0.5)',
        drag: false
      })
      return
    }

    var tune = this.session.addTune(perf)
    console.log(tune)

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

    this.ws.setTime(region.start);
    this.creating = false
    this.disableDragSelection = this.regions.enableDragSelection({
      // color: 'rgba(206.6, 226, 254.6, 0.5)',
      drag: false
    })
  }

  updateLockedState(region : Region, tune: TunePerformance) {
      console.log('updateLockedState')
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

declare global {
  // Note the capital "W"
  interface Window { 
    waveforms: { [key: string]: Waveform }
  }
}
window.waveforms = {}

window.fetch(new Request("/sessions.json"))
  .then((response) => {
      if(!response.ok) { 
          throw new Error('JSON file not found');
      }

      return response.json() as Promise<AppData>
  })
  .then((data : AppData) => {
      console.log(data)
      for(const sessionData of data.sessions) {
        var session = new Session(sessionData)
        window.waveforms[session.id] = new Waveform(session)
      }
  })
  .catch(err => {
      console.error(err)
  })
  .finally(() => {
  })

window.addEventListener('sx:load-waveform', ((e: CustomEventInit<string>) => {
  console.log('sx:load-waveform')
  console.log(e.detail)
  if(!e.detail) {
    return;
  }
  var waveform = window.waveforms[e.detail]
  waveform.load()
}) as EventListener)

window.addEventListener('sx:unload-waveform', ((e: CustomEventInit<string>) => {
  if(!e.detail) {
    return;
  }
  var waveform = window.waveforms[e.detail]
  waveform.unload()
}) as EventListener)
