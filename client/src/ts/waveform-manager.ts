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
  private zoomTimeout :  number | undefined = undefined
  private zooming = false
  private editing = false
  private scrollPosition: number | undefined = undefined
  private container: HTMLElement

  constructor(data: WaveformData) { log(arguments)()
    this.sessionId = data.session.id

    var regions = RegionsPlugin.create()
    this.regionManager = new RegionManager(data.session.id, data.performances, data.performanceId, regions)
    this.container = document.querySelector('.waveform[data-session-id="' + data.session.id + '"]') as HTMLElement
    this.ws = WaveSurfer.create({
      container: this.container,
      waveColor: 'black',
      progressColor: 'black',
      cursorColor: 'red',
      url: 'http://localhost:5110/file/' + data.session.filename,
      plugins: [regions],
      peaks: data.session.peaks,
      duration: data.session.duration
    })

    const subscribe = (unsubscribe: () => void) => this.subscriptions.push(unsubscribe)

    subscribe(this.ws.on('loading', this.onWsLoading.bind(this)))
    subscribe(this.ws.once('decode', this.onWsDecode.bind(this)))
    subscribe(this.ws.once('redrawcomplete', this.onWsReady.bind(this)))
    subscribe(this.ws.on('play', this.onWsPlay.bind(this)))
    subscribe(this.ws.on('pause', this.onWsPause.bind(this)))
    subscribe(this.ws.on('finish', this.onWsFinish.bind(this)))
    subscribe(this.ws.on('scroll', this.onWsScroll.bind(this)))
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
    subscribe(listen('sx:current-performance-changed', this.onAppCurrentPerformanceChanged.bind(this)))
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
    log('initialStartTime: ' + this.regionManager.initialStartTime)()
  }

  private onWsReady() { log(arguments)()
    this.ws.setTime(this.regionManager.initialStartTime + 0.00000001)
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
    let startTime = this.regionManager.getPreviousStartTime(this.ws.getCurrentTime());
    if(startTime) {
      this.ws.setTime(startTime + 0.00000001);
    }
  }

  private onAppSkipForward() { log(arguments)()
    let startTime = this.regionManager.getNextStartTime(this.ws.getCurrentTime());
    if(startTime) {
      this.ws.setTime(startTime + 0.00000001);
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

    // this.container.classList.add('inverted')
    var parent = this.ws.getWrapper().parentElement
    if(parent) {
      parent.style.overflowX = 'hidden'
    }
  }

  private onAppEditingStop() { log(arguments)()
    this.ws.setOptions({
      autoScroll: true,
      waveColor: 'black',
      progressColor: 'black',
      cursorColor: 'red'
    })

    // this.container.classList.remove('inverted')
    var parent = this.ws.getWrapper().parentElement
    if(parent) {
      parent.style.overflowX = 'auto'
    }

    this.scrollPosition = undefined
    this.editing = false
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
    }
  }
}
