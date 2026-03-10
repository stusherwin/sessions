import WaveSurfer from 'wavesurfer.js'
import type { Region } from 'wavesurfer.js/dist/plugins/regions.esm.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import { Session, Tune } from './session'

class Waveform {
  filename: string
  containerSelector: string
  session: Session
  regions: RegionsPlugin
  ws: WaveSurfer
  zoomTimeout :  number | undefined = undefined
  disableDragSelection : (() => void) | undefined = undefined
  zooming = false
  editing = false
  scrollPosition: number | undefined = undefined

  constructor(session: Session) {
    this.filename = session.filename
    this.containerSelector = '.waveform[data-session-id="' + session.id + '"]'
    this.session = session

    this.regions = RegionsPlugin.create()
    this.ws = WaveSurfer.create({
      container: this.containerSelector,
      waveColor: 'black',
      progressColor: 'black',
      cursorColor: 'red',
      url: '/' + this.filename,
      plugins: [this.regions],
    })

    this.ws.once('decode', () => {
      this.session.on('play-pause', () => this.playPause())
      this.session.on('play-from-start', () => this.playFromStart())
      this.session.on('skip-to-start', () => this.skipToStart())
      this.session.on('skip-to-end', () => this.skipToEnd())
      this.session.on('zoom-in', () => this.zoomIn())
      this.session.on('zoom-out', () => this.zoomOut())
      this.session.on('skip-backward', () => this.skipBackward())
      this.session.on('skip-forward', () => this.skipForward())
      this.session.on('editing-start', () => this.startEditing())
      this.session.on('editing-stop', () => this.stopEditing())
      this.session.on('tune-name-updated', (id, name) => this.songNameUpdated(id, name))
      this.ws.on('scroll', () => this.scroll())
      this.ws.on('play', () => this.play())
      this.ws.on('pause', () => this.pause())
      this.ws.on('finish', () => this.finish())
      this.regions.on('region-initialized', r => this.regionInitialized(r));
      this.regions.on('region-created', r => this.regionCreated(r))
      this.regions.on('region-update', r => this.regionUpdate(r))
      this.regions.on('region-updated', r => this.regionUpdated(r))
      this.regions.on('region-in', r => this.regionIn(r))
      this.regions.on('region-out', r => this.regionOut(r))
   })
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

  zoomIn() {
    var currentScroll = this.ws.getScroll()
    var total = this.ws.getWrapper().scrollWidth
    var mid = currentScroll + this.ws.getWidth() / 2
    var percent = (mid / total)
    var width = Math.floor(document.querySelector(this.containerSelector)?.getBoundingClientRect().width || Number.MAX_VALUE)
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
    var currentScroll = this.ws.getScroll()
    var total = this.ws.getWrapper().scrollWidth
    var mid = currentScroll + this.ws.getWidth() / 2
    var percent = (mid / total)
    var width = Math.floor(document.querySelector(this.containerSelector)?.getBoundingClientRect().width || Number.MAX_VALUE)
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

  skipBackward() {
    let tune = this.session.findPrevious(this.ws.getCurrentTime());
    if(tune) {
      this.ws.setTime(tune.startTime + 0.00000001);
    }
  }

  skipForward() {
    let tune = this.session.findNext(this.ws.getCurrentTime());
    if(tune) {
      this.ws.setTime(tune.startTime + 0.00000001);
    }
  }

  startEditing() {
    this.editing = true
    this.scrollPosition = this.ws.getScroll()

    document.querySelector(this.containerSelector)?.classList.add('inverted')
    this.ws.setOptions({
      autoScroll: false,
      waveColor: 'white',
      progressColor: 'white',
      cursorColor: 'red'
    })

    var parent = this.ws.getWrapper().parentElement
    if(parent) {
      parent.style.overflowX = 'hidden'
    }

    this.disableDragSelection = this.regions.enableDragSelection({
      // color: 'rgba(206.6, 226, 254.6, 0.5)',
      drag: false
    })

    var rs = this.regions.getRegions()
    for(var i = 0; i < rs.length; i++) {
      rs[i].resize = true
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
      rs[i].resize = false
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

    document.querySelector(this.containerSelector)?.classList.remove('inverted')
    this.ws.setOptions({
      autoScroll: true,
      waveColor: 'black',
      progressColor: 'black',
      cursorColor: 'red'
    })
    var parent = this.ws.getWrapper().parentElement
    if(parent) {
      parent.style.overflowX = 'auto'
    }


    this.scrollPosition = undefined
    this.editing = false
  }

  updateLockedState(region : Region | undefined, tune: Tune | undefined) {
    if(!tune || !region) {
      return
    }

    var el = region.element
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
      var prevNeighbourId = tune.prevNeighbour.tune.id
      var prev = this.regions.getRegions().find((r, _) => r.id == prevNeighbourId)
      lock(prev, 'right')
    }
    if(tune.nextNeighbour && tune.nextNeighbour.locked) {
      lock(region, 'right')
      var nextNeighbourId = tune.nextNeighbour.tune.id
      var next = this.regions.getRegions().find((r, _) => r.id == nextNeighbourId)
      lock(next, 'left')
    }
  }

  scroll() {
    if(!this.zooming && this.editing && this.scrollPosition) {
      this.ws.setScroll(this.scrollPosition)
      return;
    }
  }

  play() {
    this.session.playing = true;
  }

  pause() {
    this.session.playing = false;
  }

  finish() {
    this.session.playing = false;
  }

  regionInitialized(region: Region) {
    var el = region.element
    if(el) {
      el.part.add('sx-editable')
      for(var j = 0; j < el.children.length; j++) {
        el.children[j].part.add('sx-editable')
      }
    }
  }

  regionCreated(region: Region) {
    let tune = this.session.create(region.start, region.end);
    if(!tune) {
      region.remove()
      return
    }

    region.setOptions({ id : tune.id, content: tune.name, start: tune.startTime, end: tune.endTime })
    var el = region.element
    if(el) {
      el.part.add('sx-tune')
      el.part.add('sx-editable')
      for(var j = 0; j < el.children.length; j++) {
        el.children[j].part.add('sx-editable')
      }
    }

    this.updateLockedState(region, tune)

    this.ws.setTime(region.start);
  }

  findRegion(regionId: string) : Region | undefined {
    return this.regions.getRegions().find((r, _) => r.id == regionId)
  }

  regionUpdate(region: Region) {
    let tune = this.session.find(region.id);

    if(!tune) {
      return
    }

    tune.update(region.start, region.end)
    region.setOptions({ start: tune.startTime, end: tune.endTime })

    this.updateLockedState(region, tune)

    if(tune.prevNeighbour) {
      var prevRegion = this.findRegion(tune.prevNeighbour.tune.id)
      prevRegion?.setOptions({ start: tune.prevNeighbour.tune.startTime, end: tune.prevNeighbour.tune.endTime })
      this.updateLockedState(prevRegion, tune.prevNeighbour?.tune)
    }

    if(tune.nextNeighbour) {
      var nextRegion = this.findRegion(tune.nextNeighbour.tune.id)
      nextRegion?.setOptions({ start: tune.nextNeighbour.tune.startTime, end: tune.nextNeighbour.tune.endTime })
      this.updateLockedState(nextRegion, tune.nextNeighbour?.tune)
    }
  }

  regionUpdated(region: Region) {
    let tune = this.session.find(region.id);

    if(!tune) {
      return
    }

    tune.lockNeighbours()
    this.updateLockedState(region, tune)

    if(tune.prevNeighbour) {
      var prevRegion = this.findRegion(tune.prevNeighbour.tune.id)
      this.updateLockedState(prevRegion, tune.prevNeighbour?.tune)
    }

    if(tune.nextNeighbour) {
      var nextRegion = this.findRegion(tune.nextNeighbour.tune.id)
      this.updateLockedState(nextRegion, tune.nextNeighbour?.tune)
    }
  }

  regionIn(region: Region) {
    this.session.in(region.id)
    for(var i = 0; i < this.session.tunes.length; i++) {
      var tune = this.session.tunes[i]
      var r = this.findRegion(tune.id)
      if(tune.current) {
        r?.element?.part.add('sx-current')
      } else {
        r?.element?.part.remove('sx-current')
      }
    }
  }

  regionOut(region: Region) {
    this.session.out(region.id)
    for(var i = 0; i < this.session.tunes.length; i++) {
      var tune = this.session.tunes[i]
      var r = this.findRegion(tune.id)
      if(tune.current) {
        r?.element?.part.add('sx-current')
      } else {
        r?.element?.part.remove('sx-current')
      }
    }
  }

  songNameUpdated(id: string, name: string) {
    var r = this.regions.getRegions().find((r, _) => r.id == id)
    if(r) {
      r.setContent(name || '')
    }
  }
}

export default Waveform