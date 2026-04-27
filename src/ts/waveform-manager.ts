import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import type { Session, TunePerformance } from './data.ts'
import { TuneRegionManager } from './tune-region-manager.ts'
import { dispatch, listen } from './helpers.ts'

export interface WaveformData {
  session: Session
  tuneId: string | undefined
}

export class WaveformManager {
  session: Session
  initialTuneId: string | undefined
  tuneRegions: TuneRegionManager
  ws: WaveSurfer
  subscriptions: (() => void)[] = []
  zoomTimeout :  number | undefined = undefined
  zooming = false
  editing = false
  scrollPosition: number | undefined = undefined
  container: HTMLElement

  constructor(data: WaveformData) {
    this.session = data.session
    this.initialTuneId = data.tuneId

    const subscribe = (unsubscribe: () => void) => this.subscriptions.push(unsubscribe)

    var regions = RegionsPlugin.create()
    this.tuneRegions = new TuneRegionManager(this.session.tunes, regions)

    subscribe(this.tuneRegions.on('tune-region-creating', (startTime, endTime) => 
      dispatch('sx:tune-creating', { sessionId: this.session.id, startTime, endTime })))

    subscribe(this.tuneRegions.on('tune-region-created', (startTime, _) => 
      this.ws.setTime(startTime)))

    subscribe(this.tuneRegions.on('tune-region-updating', (tuneId, startTime, endTime) => 
      dispatch('sx:tune-updating', { sessionId: this.session.id, tuneId, startTime, endTime })))

    subscribe(this.tuneRegions.on('tune-region-updated', (tuneId, startTime, endTime) => {}))
    subscribe(this.tuneRegions.on('current-tune-region-changed', (tuneId) => 
      dispatch('sx:current-tune-changed', { sessionId: this.session.id, tuneId })))

    this.container = document.querySelector('.waveform[data-session-id="' + this.session.id + '"]') as HTMLElement
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
      if(this.initialTuneId) {
        var region = this.tuneRegions.findRegion(this.initialTuneId)
        if(region) {
          this.ws.setTime(region.start)
        }
      }
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
    
    subscribe(listen('sx:tune-performance-deleted', (tune: TunePerformance) => {
      if(tune.sessionId != this.session.id) {
        return
      }

      this.tuneRegions.delete(tune)
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
