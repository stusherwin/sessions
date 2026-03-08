import WaveSurfer from 'wavesurfer.js'
import type { Region } from 'wavesurfer.js/dist/plugins/regions.esm.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import { Session, Song } from './session'

interface RegionNameUpdate {
  id: string,
  name: string
}

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

  constructor(filename: string, containerSelector: string, session: Session) {
    this.filename = filename
    this.containerSelector = containerSelector
    this.session = session

    this.regions = RegionsPlugin.create()
    this.ws = WaveSurfer.create({
      container: containerSelector,
      waveColor: 'black',
      progressColor: 'black',
      cursorColor: 'red',
      url: '/' + filename,
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
      window.addEventListener('sx-song-name-updated', ((e: CustomEventInit<RegionNameUpdate>) => {
        this.songNameUpdated(e.detail?.id, e.detail?.name)
      }) as EventListener)
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
    let song = this.session.findPrevious(this.ws.getCurrentTime());
    if(song) {
      this.ws.setTime(song.startTime + 0.00000001);
    }
  }

  skipForward() {
    let song = this.session.findNext(this.ws.getCurrentTime());
    if(song) {
      this.ws.setTime(song.startTime + 0.00000001);
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

  updateLockedState(region : Region | undefined, song: Song | undefined) {
    if(!song || !region) {
      return
    }

    var el = region.element
    if(el) {
      el.part.add('sx-song')
      el.part.add('sx-editable')
      for(var j = 0; j < el.children.length; j++) {
        el.children[j].part.add('sx-editable')
      }
      if(song.current) {
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

    if(song.prevNeighbour && song.prevNeighbour.locked) {
      lock(region, 'left')
      var prevNeighbourId = song.prevNeighbour.song.id
      var prev = this.regions.getRegions().find((r, _) => r.id == prevNeighbourId)
      lock(prev, 'right')
    }
    if(song.nextNeighbour && song.nextNeighbour.locked) {
      lock(region, 'right')
      var nextNeighbourId = song.nextNeighbour.song.id
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
    let song = this.session.create(region.start, region.end);
    if(!song) {
      region.remove()
      return
    }

    region.setOptions({ id : song.id, content: song.name, start: song.startTime, end: song.endTime })
    var el = region.element
    if(el) {
      el.part.add('sx-song')
      el.part.add('sx-editable')
      for(var j = 0; j < el.children.length; j++) {
        el.children[j].part.add('sx-editable')
      }
    }

    this.updateLockedState(region, song)

    this.ws.setTime(region.start);
  }

  findRegion(regionId: string) : Region | undefined {
    return this.regions.getRegions().find((r, _) => r.id == regionId)
  }

  regionUpdate(region: Region) {
    let song = this.session.find(region.id);

    if(!song) {
      return
    }

    song.update(region.start, region.end)
    region.setOptions({ start: song.startTime, end: song.endTime })

    this.updateLockedState(region, song)

    if(song.prevNeighbour) {
      var prevRegion = this.findRegion(song.prevNeighbour.song.id)
      prevRegion?.setOptions({ start: song.prevNeighbour.song.startTime, end: song.prevNeighbour.song.endTime })
      this.updateLockedState(prevRegion, song.prevNeighbour?.song)
    }

    if(song.nextNeighbour) {
      var nextRegion = this.findRegion(song.nextNeighbour.song.id)
      nextRegion?.setOptions({ start: song.nextNeighbour.song.startTime, end: song.nextNeighbour.song.endTime })
      this.updateLockedState(nextRegion, song.nextNeighbour?.song)
    }
  }

  regionUpdated(region: Region) {
    let song = this.session.find(region.id);

    if(!song) {
      return
    }

    song.lockNeighbours()
    this.updateLockedState(region, song)

    if(song.prevNeighbour) {
      var prevRegion = this.findRegion(song.prevNeighbour.song.id)
      this.updateLockedState(prevRegion, song.prevNeighbour?.song)
    }

    if(song.nextNeighbour) {
      var nextRegion = this.findRegion(song.nextNeighbour.song.id)
      this.updateLockedState(nextRegion, song.nextNeighbour?.song)
    }
  }

  regionIn(region: Region) {
    this.session.in(region.id)
    for(var i = 0; i < this.session.songs.length; i++) {
      var song = this.session.songs[i]
      var r = this.findRegion(song.id)
      if(song.current) {
        r?.element?.part.add('sx-current')
      } else {
        r?.element?.part.remove('sx-current')
      }
    }
  }

  regionOut(region: Region) {
    this.session.out(region.id)
    for(var i = 0; i < this.session.songs.length; i++) {
      var song = this.session.songs[i]
      var r = this.findRegion(song.id)
      if(song.current) {
        r?.element?.part.add('sx-current')
      } else {
        r?.element?.part.remove('sx-current')
      }
    }
  }

  songNameUpdated(id: string | undefined, name: string | undefined) {
    var r = this.regions.getRegions().find((r, _) => r.id == id)
    if(r) {
      r.setContent(name || '')
    }
  }
}

export default Waveform