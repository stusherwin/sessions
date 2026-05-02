import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import type { Session, TunePerformance, TunePerformanceMove } from './data.ts'
import { TuneRegionManager } from './tune-region-manager.ts'
import { dispatch, listen } from './common.ts'
import { log } from './common.ts'

export interface WaveformData {
  session: Session
  performanceId: string | undefined
}

export class WaveformManager {
  sessionId: string
  private initialPerformanceId: string | undefined
  private tuneRegions: TuneRegionManager
  private ws: WaveSurfer
  private subscriptions: (() => void)[] = []
  private zoomTimeout :  number | undefined = undefined
  private zooming = false
  private editing = false
  private scrollPosition: number | undefined = undefined
  private container: HTMLElement

  constructor(data: WaveformData) {
    this.sessionId = data.session.id
    this.initialPerformanceId = data.performanceId

    var regions = RegionsPlugin.create()
    this.tuneRegions = new TuneRegionManager(data.session.tunes, regions)
    this.container = document.querySelector('.waveform[data-session-id="' + data.session.id + '"]') as HTMLElement
    this.ws = WaveSurfer.create({
      container: this.container,
      waveColor: 'black',
      progressColor: 'black',
      cursorColor: 'red',
      url: '/' + data.session.filename,
      plugins: [regions],
      peaks: data.session.peaks,
      duration: data.session.duration
    })

    const subscribe = (unsubscribe: () => void) => this.subscriptions.push(unsubscribe)

    subscribe(this.tuneRegions.on('tune-region-creating', this.onTrTuneRegionCreating.bind(this)))
    subscribe(this.tuneRegions.on('tune-region-created', this.onTrTuneRegionCreated.bind(this)))
    subscribe(this.tuneRegions.on('tune-region-updating', this.onTrTuneRegionUpdating.bind(this)))
    subscribe(this.tuneRegions.on('tune-region-updated', this.onTrTuneRegionUpdated.bind(this)))
    subscribe(this.tuneRegions.on('current-tune-region-changed', this.onTrCurrentTuneRegionChanged.bind(this)))
    subscribe(this.ws.on('loading', this.onWsLoading.bind(this)))
    subscribe(this.ws.once('decode', this.onWsDecode.bind(this)))
    subscribe(this.ws.on('play', this.onWsPlay.bind(this)))
    subscribe(this.ws.on('pause', this.onWsPause.bind(this)))
    subscribe(this.ws.on('finish', this.onWsFinish.bind(this)))
    subscribe(this.ws.on('scroll', this.onWsScroll.bind(this)))
    subscribe(listen('sx:tune-created', this.onAppTuneCreated.bind(this)))
    subscribe(listen('sx:tune-updated', this.onAppTuneUpdated.bind(this)))
    subscribe(listen('sx:tune-name-updated', this.onAppTuneNameUpdated.bind(this)))
    subscribe(listen('sx:tune-performance-deleted', this.onAppTunePerformanceDeleted.bind(this)))
    subscribe(listen('sx:tune-performance-moved', this.onAppTunePerformanceMoved.bind(this)))
    subscribe(listen('sx:play-pause', this.onAppPlayPause.bind(this)))
    subscribe(listen('sx:play-from-start', this.onAppPlayFromStart.bind(this)))
    subscribe(listen('sx:skip-to-start', this.onAppSkipToStart.bind(this)))
    subscribe(listen('sx:skip-to-end', this.onAppSkipToEnd.bind(this)))
    subscribe(listen('sx:skip-backward', this.onAppSkipBackward.bind(this)))
    subscribe(listen('sx:skip-forward', this.onAppSkipForward.bind(this)))
    subscribe(listen('sx:zoom-in', this.onAppZoomIn.bind(this)))
    subscribe(listen('sx:zoom-out', this.onAppZoomOut.bind(this)))
    subscribe(listen('sx:editing-start', this.onAppEditingStart.bind(this)))
    subscribe(listen('sx:editing-stop', this.onAppEditingStop.bind(this)))
  }

  unload() { log(arguments)()
    for(var unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions = [];
    this.tuneRegions.unload()
    this.ws.destroy();
  }

  private onWsLoading(percent: number) { log(arguments)()
    dispatch('sx:waveform-load-progress-updated', { id: this.sessionId, loading: percent })
  }

  private onWsDecode() { log(arguments)()
    this.tuneRegions.init()

    dispatch('sx:waveform-ready', { id: this.sessionId })
    if(this.initialPerformanceId) {
      var region = this.tuneRegions.findRegion(this.initialPerformanceId)
      if(region) {
        this.ws.setTime(region.start)
      }
    }
  }
  
  private onAppTuneCreated(tune: TunePerformance) { log(arguments)()
    if(tune.sessionId != this.sessionId) {
      return
    }

    this.tuneRegions.create(tune)
  }
  
  private onAppTuneUpdated(tune: TunePerformance) { log(arguments)()
    if(tune.sessionId != this.sessionId) {
      return
    }

    this.tuneRegions.update(tune)
  }
  
  private onAppTuneNameUpdated(tune: TunePerformance) { log(arguments)()
    if(tune.sessionId != this.sessionId) {
      return
    }

    this.tuneRegions.updateName(tune)
  }
  
  private onAppTunePerformanceDeleted(tune: TunePerformance) { log(arguments)()
    if(tune.sessionId != this.sessionId) {
      return
    }

    this.tuneRegions.delete(tune)
  }
  
  private onAppTunePerformanceMoved(move: TunePerformanceMove) { log(arguments)()
    if(move.sessionId != this.sessionId) {
      return
    }

    this.tuneRegions.move(move)
  }

  private onTrTuneRegionCreating(startTime: number, endTime: number) { log(arguments)()
    dispatch('sx:tune-creating', { sessionId: this.sessionId, startTime, endTime })
  }

  private onTrTuneRegionCreated(startTime: number, endTime: number) { log(arguments)()
    this.ws.setTime(startTime)
  }

  private onTrTuneRegionUpdating(id: string, startTime: number, endTime: number) { log(arguments)()
    dispatch('sx:tune-updating', { sessionId: this.sessionId, id, startTime, endTime })
  }

  private onTrTuneRegionUpdated(id: string, startTime: number, endTime: number) {  log(arguments)() }
  
  private onTrCurrentTuneRegionChanged(id: string | undefined) { log(arguments)()
    dispatch('sx:current-tune-changed', { sessionId: this.sessionId, id })
  }

  private onWsPlay() { log(arguments)()
    dispatch('sx:playing', {}) 
  }
  
  private onWsPause() { log(arguments)()
    dispatch('sx:stopped', {}) 
  }
  
  private onWsFinish() { log(arguments)()
    dispatch('sx:stopped', {}) 
  }
  
  private onWsScroll() { log(arguments)()
    if(!this.zooming && this.editing && this.scrollPosition) {
      this.ws.setScroll(this.scrollPosition)
      return;
    }
  }

  private onAppPlayPause() { log(arguments)()
    this.ws.playPause();
  }

  private onAppPlayFromStart() { log(arguments)()
    this.ws.setTime(0);
    this.ws.play();
  }

  private onAppSkipToStart() { log(arguments)()
    this.ws.setTime(0);
  }

  private onAppSkipToEnd() { log(arguments)()
    this.ws.seekTo(1);
  }

  private onAppSkipBackward() { log(arguments)()
    let tune = this.tuneRegions.findPrevious(this.ws.getCurrentTime());
    if(tune) {
      this.ws.setTime(tune.startTime + 0.00000001);
    }
  }

  private onAppSkipForward() { log(arguments)()
    let tune = this.tuneRegions.findNext(this.ws.getCurrentTime());
    if(tune) {
      this.ws.setTime(tune.startTime + 0.00000001);
    }
  }

  private onAppZoomIn() { log(arguments)()
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

  private onAppZoomOut() { log(arguments)()
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

  private onAppEditingStart() { log(arguments)()
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

  private onAppEditingStop() { log(arguments)()
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
