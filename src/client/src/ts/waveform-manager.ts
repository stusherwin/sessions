import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import type { Session, Performance } from './data.ts'
import { RegionManager } from './region-manager.ts'
import { dispatch, listen } from './common.ts'
import { log } from './common.ts'

export interface WaveformData {
  session: Session
  performances: Performance[]
  performanceId: string | undefined
}

export class WaveformManager {
  sessionId: string
  private regionManager: RegionManager
  private ws: WaveSurfer
  private subscriptions: (() => void)[] = []
  // private zoomTimeout : number | undefined = undefined
  // private zooming = false
  private editing = false
  private scrolling = false
  private scrollEnableTimeout: number | undefined = undefined
  private autoScrollEnableTimeout: number | undefined =  undefined
  // private scrollPosition: number | undefined = undefined
  private container: HTMLElement

  constructor(data: WaveformData, peaks: number[][] | undefined) { log(arguments)()
    this.sessionId = data.session.id

    var regions = RegionsPlugin.create()
    this.regionManager = new RegionManager(data.session.id, data.performances, data.performanceId, regions)
    this.container = document.querySelector(`.waveform[data-session-id="${this.sessionId}"]`) as HTMLElement
    this.ws = WaveSurfer.create({
      container: this.container,
      waveColor: 'black',
      progressColor: 'black',
      cursorColor: 'red',
      url: `${location.pathname}/api/session/${this.sessionId}/file`,
      plugins: [regions],
      peaks: peaks,
      duration: data.session.duration
    })
    this.container.addEventListener('contextmenu', event => event.preventDefault());

    const subscribe = (unsubscribe: () => void) => this.subscriptions.push(unsubscribe)

    subscribe(this.ws.on('loading', this.onWsLoading.bind(this)))
    subscribe(this.ws.once('decode', this.onWsDecode.bind(this)))
    subscribe(this.ws.once('redrawcomplete', this.onWsReady.bind(this)))
    subscribe(this.ws.on('play', this.onWsPlay.bind(this)))
    subscribe(this.ws.on('pause', this.onWsPause.bind(this)))
    subscribe(this.ws.on('finish', this.onWsFinish.bind(this)))
    subscribe(this.ws.on('scroll', this.onWsScroll.bind(this)))
    subscribe(this.ws.on('click', (x, y) => log(x, y)()))
    subscribe(this.ws.on('interaction', (t) => { log(t)(); this.ws.setTime(t); log(this.ws.getCurrentTime())(); }))
    subscribe(listen('sx:playing-start', this.onAppPlayingStart.bind(this)))
    subscribe(listen('sx:playing-stop', this.onAppPlayingStop.bind(this)))
    subscribe(listen('sx:skip-to-start', this.onAppSkipToStart.bind(this)))
    subscribe(listen('sx:skip-to-end', this.onAppSkipToEnd.bind(this)))
    subscribe(listen('sx:skip-backward', this.onAppSkipBackward.bind(this)))
    subscribe(listen('sx:skip-forward', this.onAppSkipForward.bind(this)))
    subscribe(listen('sx:nudge-backward', this.onAppNudgeBackward.bind(this)))
    subscribe(listen('sx:nudge-forward', this.onAppNudgeForward.bind(this)))
    subscribe(listen('sx:zoom-in', this.onAppZoomIn.bind(this)))
    subscribe(listen('sx:zoom-out', this.onAppZoomOut.bind(this)))
    subscribe(listen('sx:editing-start', this.onAppEditingStart.bind(this)))
    subscribe(listen('sx:editing-stop', this.onAppEditingStop.bind(this)))
    subscribe(listen('sx:current-performance-changed', this.onAppCurrentPerformanceChanged.bind(this)))
    subscribe(listen('sx:split-current-tune', this.onAppSplitCurrentTune.bind(this)))
    subscribe(listen('sx:change-current-tune', this.onAppChangeCurrentTune.bind(this)))
  }

  unload() { log(arguments)()
    for(var unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions = [];
    this.regionManager.unload()
    this.ws.destroy();
  }

  private onWsLoading(percent: number) { log(arguments)()
    dispatch('sx:waveform-load-progress-updated', { id: this.sessionId, loading: percent })
  }

  private onWsDecode() { log(arguments)()
    this.regionManager.init()

    dispatch('sx:waveform-ready', { id: this.sessionId })
  }

  private onWsReady() { log(arguments)()
    log('duration: ' + this.ws.getDuration())();
    var peaks = this.ws.exportPeaks()
    log(peaks)()
    var span = this.regionManager.initialStartAndEndTime
    if(span) {
      log(span)()
      this.ws.setTime(span.startTime + 0.00000001)
      // var duration = span.endTime - span.startTime

      // setTimeout(() => {
      //   var width = Math.floor(this.container.getBoundingClientRect().width || Number.MAX_VALUE)
      //   var targetLevel = width / duration / 3
      //   this.zooming = true
      //   clearTimeout(this.zoomTimeout)
      //   this.ws.zoom(targetLevel)
      //   this.zoomTimeout = setTimeout(() => this.zooming = false, 1000)
      // })
    }
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
    // TODO: how to distinguish manual scrolling from autoscrolling?

    if(this.autoScrollEnableTimeout) {
      clearTimeout(this.autoScrollEnableTimeout)
    }

    if(this.editing) {
      return
    }

    this.scrolling = true
    this.updateScrollState()

    this.autoScrollEnableTimeout = setTimeout(() => {
      this.autoScrollEnableTimeout = undefined
      this.scrolling = false
      this.updateScrollState()
    }, 2000)
  }

  private onAppPlayingStart() { log(arguments)()
    this.ws.play();
  }

  private onAppPlayingStop() { log(arguments)()
    this.ws.pause();
  }

  private onAppSkipToStart() { log(arguments)()
    this.ws.setTime(0);
  }

  private onAppSkipToEnd() { log(arguments)()
    this.ws.seekTo(1);
  }

  private onAppSkipBackward() { log(arguments)()
    let span = this.regionManager.getPreviousStartAndEndTime(this.ws.getCurrentTime());
    if(span) {
      this.ws.setTime(span.startTime + 0.00000001);
    }
  }

  private onAppSkipForward() { log(arguments)()
    let span = this.regionManager.getNextStartAndEndTime(this.ws.getCurrentTime());
    if(span) {
      this.ws.setTime(span.startTime + 0.00000001);
    }
  }

  private onAppChangeCurrentTune(performanceId: string) { log(arguments)()
    let span = this.regionManager.getStartAndEndTime(performanceId);
    if(span) {
      this.ws.setTime(span.startTime + 0.00000001);
    }
  }

  private onAppNudgeBackward() { log(arguments)()
    this.ws.setTime(this.ws.getCurrentTime() - 0.5);
  }

  private onAppNudgeForward() { log(arguments)()
    this.ws.setTime(this.ws.getCurrentTime() + 0.5);
  }

  private onAppZoomIn() { log(arguments)()
    // var currentScroll = this.ws.getScroll()
    // var total = this.ws.getWrapper().scrollWidth
    // var mid = currentScroll + this.ws.getWidth() / 2
    // var percent = (mid / total)
    var width = Math.floor(this.container.getBoundingClientRect().width || Number.MAX_VALUE)
    var duration = this.ws.getDuration()
    var zoomedOut = width / duration
    var currentLevel = this.ws.options.minPxPerSec == 0 ? zoomedOut : this.ws.options.minPxPerSec
    var targetLevel = Math.min(width, currentLevel * 4)
    // this.zooming = true
    // clearTimeout(this.zoomTimeout)
    this.ws.zoom(targetLevel)
    // var newTotal = this.ws.getWrapper().scrollWidth
    // var newMid = percent * newTotal
    // var newScroll = newMid - this.ws.getWidth() / 2
    // if(this.editing) {
    //   this.scrollPosition = newScroll
    // }
    // this.ws.setScroll(newScroll)
    // this.zoomTimeout = setTimeout(() => this.zooming = false, 1000)

    this.updateScrollState()
  }

  private onAppZoomOut() { log(arguments)()
    // var currentScroll = this.ws.getScroll()
    // var total = this.ws.getWrapper().scrollWidth
    // var mid = currentScroll + this.ws.getWidth() / 2
    // var percent = (mid / total)
    var width = Math.floor(this.container.getBoundingClientRect().width || Number.MAX_VALUE)
    var duration = this.ws.getDuration()
    var zoomedOut = width / duration
    var currentLevel = this.ws.options.minPxPerSec == 0 ? zoomedOut : this.ws.options.minPxPerSec
    var targetLevel = Math.max(zoomedOut, currentLevel / 4)
    // this.zooming = true
    // clearTimeout(this.zoomTimeout)
    this.ws.zoom(targetLevel)
    // var newTotal = this.ws.getWrapper().scrollWidth
    // var newMid = percent * newTotal
    // var newScroll = newMid - this.ws.getWidth() / 2
    // if(this.editing) {
    //   this.scrollPosition = newScroll
    // }
    // this.ws.setScroll(newScroll)
    // this.zoomTimeout = setTimeout(() => this.zooming = false, 1000)
    
    this.updateScrollState()
  }

  private onAppEditingStart() { log(arguments)()
    if(this.scrollEnableTimeout) {
      clearTimeout(this.scrollEnableTimeout)
    }

    this.editing = true
    // this.scrollPosition = this.ws.getScroll()

    this.ws.setOptions({
      waveColor: 'white',
      progressColor: 'white',
      cursorColor: 'red'
    })

    this.updateScrollState()
    // this.container.classList.add('inverted')
  }

  private onAppEditingStop() { log(arguments)()
    this.ws.setOptions({
      waveColor: 'black',
      progressColor: 'black',
      cursorColor: 'red'
    })

    // this.container.classList.remove('inverted')
    // this.scrollPosition = undefined
    this.editing = false

    this.scrollEnableTimeout = setTimeout(() => {
      this.updateScrollState()
      this.scrollEnableTimeout = undefined
    } , 2000);
  }
    
  private onAppCurrentPerformanceChanged(details: {
    sessionId: string, 
    performanceId: string | undefined, 
    startTime: number | undefined,
    endTime: number | undefined,
    forced: boolean
  }) { log(arguments)()
    if(details.forced && details.startTime) {
      log('setting time to: ' + (details.startTime + 0.00000001))
      this.ws.setTime(details.startTime + 0.00000001)

      if(!details.endTime) {
        return
      }

      // var performanceDuration = details.endTime - details.startTime
      // // var width = Math.floor(this.container.getBoundingClientRect().width || Number.MAX_VALUE)
      // // var duration = this.ws.getDuration()
      
      // var total = this.ws.getWrapper().scrollWidth
      // var targetLevel = total / performanceDuration
      // this.ws.zoom(targetLevel)

      // // var currentScroll = this.ws.getScroll()
      // // var total = this.ws.getWrapper().scrollWidth
      // // var mid = currentScroll + this.ws.getWidth() / 2
      // // var percent = (mid / total)
      // // var width = Math.floor(this.container.getBoundingClientRect().width || Number.MAX_VALUE)

      // // var duration = this.ws.getDuration()
      // // var zoomedOut = width / duration
      // // var currentLevel = this.ws.options.minPxPerSec == 0 ? zoomedOut : this.ws.options.minPxPerSec

      // // var targetLevel = Math.min(width, currentLevel * 2)
      // // this.zooming = true
      // // clearTimeout(this.zoomTimeout)
      // // this.ws.zoom(targetLevel)
      // // var newTotal = this.ws.getWrapper().scrollWidth
      // // var newMid = percent * newTotal
      // // var newScroll = newMid - this.ws.getWidth() / 2
      // // if(this.editing) {
      // //   this.scrollPosition = newScroll
      // // }
      // // this.ws.setScroll(newScroll)
      // // this.zoomTimeout = setTimeout(() => this.zooming = false, 1000)
    }
  }

  private onAppSplitCurrentTune() { log(arguments)()
    this.regionManager.splitCurrentTune(this.ws.getCurrentTime())
  }

  private updateScrollState() { log(arguments)()
      this.ws.setOptions({
        autoScroll: !this.editing && !this.scrolling,
      })

      var parent = this.ws.getWrapper().parentElement
      if(parent) {
        parent.style.overflowX = this.editing ? 'hidden' : 'auto'
      }
  }
}
