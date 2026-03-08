import Alpine from 'alpinejs'
import persist from '@alpinejs/persist'
import WaveSurfer from 'wavesurfer.js'
import type { Region } from 'wavesurfer.js/dist/plugins/regions.esm.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import '../scss/styles.scss'
import iconsRaw from 'bootstrap-icons/bootstrap-icons.svg?raw'

var allSvg = document.getElementById('all')
if(allSvg) {
  allSvg.innerHTML = iconsRaw;
}

window.Alpine = Alpine
Alpine.plugin(persist)

class Controls {
  playing: boolean = false
  editing: boolean = false

  init() {
    this.playing = false
    this.editing = false
  }

  playFromStart() {
    dispatchEvent(new CustomEvent('sx-controls-play-from-start', { detail: this }))
  }

  skipToStart() {
    dispatchEvent(new CustomEvent('sx-controls-skip-to-start', { detail: this }))
  }

  skipToEnd() {
    dispatchEvent(new CustomEvent('sx-controls-skip-to-end', { detail: this }))
  }

  skipBackward() {
    dispatchEvent(new CustomEvent('sx-controls-skip-backward', { detail: this }))
  }

  skipForward() {
    dispatchEvent(new CustomEvent('sx-controls-skip-forward', { detail: this }))
  }

  playPause() {
    dispatchEvent(new CustomEvent('sx-controls-play-pause', { detail: this }))
  }

  zoomIn() {
    dispatchEvent(new CustomEvent('sx-controls-zoom-in', { detail: this }))
  }

  zoomOut() {
    dispatchEvent(new CustomEvent('sx-controls-zoom-out', { detail: this }))
  }

  toggleEditing() {
    this.editing = !this.editing
    if(this.editing) {
      dispatchEvent(new CustomEvent('sx-controls-editing-start', { detail: this }))
    } else {
      dispatchEvent(new CustomEvent('sx-controls-editing-stop', { detail: this }))
    }
  }
}

var delta = 2;

class Songs {
  all: Song[] = []
  nextSongId: number = 1

  init() {
  }

  create(startTime: number, endTime: number) {
    var newSong = new Song('song-' + this.nextSongId, 'Song ' + this.nextSongId, startTime, endTime)

    if(!this.all.length) {
      this.all = [newSong]
      this.nextSongId++
      return newSong;
    }

    for(var i = 0; i < this.all.length; i++) {
      let song = this.all[i]
      if(newSong.startTime < song.startTime && song.endTime < newSong.endTime) {
        return null;
      }
    }

    var newAll = []
    var pushed = false
    for(var i = 0; i < this.all.length; i++) {
      let song = this.all[i]

      //       [ A ]       [ B ]
      // <-1->
      if(!pushed && newSong.startTime < song.startTime && newSong.endTime < song.startTime) {
        var prevNeighbour = song.prevNeighbour
        if(prevNeighbour) {
          prevNeighbour.song.nextNeighbour = new SongNeighbour(newSong, prevNeighbour.locked)
        }
        newSong.prevNeighbour = prevNeighbour
        newSong.nextNeighbour = new SongNeighbour(song, false)
        newAll.push(newSong)
        pushed = true
        song.prevNeighbour = new SongNeighbour(newSong, false)
      //       [ A ]       [ B ]
      //     <-2->
      } else if(!pushed && newSong.startTime < song.startTime && song.startTime < newSong.endTime && newSong.endTime < song.endTime) {
        var prevNeighbour = song.prevNeighbour
        if(prevNeighbour) {
          prevNeighbour.song.nextNeighbour = new SongNeighbour(newSong, prevNeighbour.locked)
        }
        newSong.endTime = song.startTime
        newSong.prevNeighbour = prevNeighbour
        newSong.nextNeighbour = new SongNeighbour(song, true)
        newAll.push(newSong)
        pushed = true
        song.prevNeighbour = new SongNeighbour(newSong, true)
      }

      newAll.push(song)

      //       [ A ]       [ B ]
      //         <-3->
      if(!pushed && song.startTime < newSong.startTime && newSong.startTime < song.endTime && song.endTime < newSong.endTime) {
        var nextNeighbour = song.nextNeighbour
        if(nextNeighbour) {
          nextNeighbour.song.prevNeighbour = new SongNeighbour(newSong, nextNeighbour.locked)
        }
        newSong.startTime = song.endTime
        newSong.prevNeighbour = new SongNeighbour(song, true)
        newSong.nextNeighbour = nextNeighbour
        song.nextNeighbour = new SongNeighbour(newSong, true)
        newAll.push(newSong)
        pushed = true
      //       [ A ]       [ B ]
      //             <-4->
      } else if(!pushed && song.endTime < newSong.startTime && i == this.all.length - 1) {
        newSong.prevNeighbour = new SongNeighbour(song, false)
        newSong.nextNeighbour = song.nextNeighbour
        song.nextNeighbour = new SongNeighbour(newSong, false)
        newAll.push(newSong)
        pushed = true
      }
    }

    this.all = newAll
    this.nextSongId++

    return newSong
  }

  find(id: string) : Song | undefined {
    return this.all.find(s => s.id == id)
  }

  findNext(time: number) : Song | undefined {
    for(var i = 0; i < this.all.length; i++) {
      var song = this.all[i]
      if(song.startTime > time) {
        return song
      }
    }
  }

  findPrevious(time: number) : Song | undefined {
    for(var i = this.all.length - 1; i >= 0; i--) {
      var song = this.all[i]
      if(song.startTime < time - delta) {
        return song
      }
    }
  }

  in(id: string) {
    for(var i = 0; i < this.all.length; i++) {
      let song = this.all[i]
      song.current = song.id === id
    }
  }

  out(id: string) {
    for(var i = 0; i < this.all.length; i++) {
      let song = this.all[i]
      if(song.id === id) {
        song.current = false
      }
    }
  }
}

class SongNeighbour {
  song: Song
  locked: boolean

  constructor(song: Song, locked: boolean) {
    this.song = song
    this.locked = locked
  }
}

class Song {
  id: string
  name: string
  startTime: number
  endTime: number
  current: boolean = false
  prevNeighbour: SongNeighbour | undefined = undefined
  nextNeighbour: SongNeighbour | undefined = undefined

  constructor(id: string, name: string, startTime: number, endTime: number) {
    this.id = id
    this.name = name
    this.startTime = startTime
    this.endTime = endTime
    dispatchEvent(new CustomEvent('sx-region-name-updated', { detail: this }))
  }

  update(startTime: number, endTime: number) {
    if(this.prevNeighbour) {
      if(this.prevNeighbour.locked) {
        this.prevNeighbour.song.endTime = startTime
      } else {
        if(startTime < this.prevNeighbour.song.endTime) {
          startTime = this.prevNeighbour.song.endTime
        }
      }
    }

    if(this.nextNeighbour) {
      if(this.nextNeighbour.locked) {
        this.nextNeighbour.song.startTime = endTime
      } else {
        if(this.nextNeighbour.song.startTime < endTime) {
          endTime = this.nextNeighbour.song.startTime
        }
      }
    }

    this.startTime = startTime
    this.endTime = endTime
  }

  lockNeighbours() {
    if(this.prevNeighbour && this.startTime == this.prevNeighbour.song.endTime) {
      this.prevNeighbour.locked = true;
      this.prevNeighbour.song.nextNeighbour = new SongNeighbour(this, true);
    }

    if(this.nextNeighbour && this.endTime == this.nextNeighbour.song.startTime) {
      this.nextNeighbour.locked = true;
      this.nextNeighbour.song.prevNeighbour = new SongNeighbour(this, true);
    }
  }
}

// export default Song
declare global {
    // Note the capital "W"
    interface Window { Song: any; }
}

window.Song = Song

Alpine.store('controls', new Controls())
Alpine.store('songs', new Songs())
Alpine.start()

const regions = RegionsPlugin.create()

const ws = WaveSurfer.create({
  container: '#waveform',
  waveColor: 'black',
  progressColor: 'black',
  cursorColor: 'red',
  url: '/session1.mp3',
  plugins: [regions],
})

ws.once('decode', () => {
  window.addEventListener('sx-controls-play-pause', _ => {
    ws.playPause();
  })

  window.addEventListener('sx-controls-play-from-start', _ => {
    ws.setTime(0);
    ws.play();
  })

  window.addEventListener('sx-controls-skip-to-start', _ => {
    ws.setTime(0);
  })

  window.addEventListener('sx-controls-skip-to-end', _ => {
    ws.seekTo(1);
  })

  var zoomTimeout :  number | undefined = undefined
  window.addEventListener('sx-controls-zoom-in', _ => {
    var currentScroll = ws.getScroll()
    var total = ws.getWrapper().scrollWidth
    var mid = currentScroll + ws.getWidth() / 2
    var percent = (mid / total)
    var width = Math.floor(document.getElementById('waveform')?.getBoundingClientRect().width || Number.MAX_VALUE)
    var duration = ws.getDuration()
    var zoomedOut = width / duration
    var currentLevel = ws.options.minPxPerSec == 0 ? zoomedOut : ws.options.minPxPerSec
    var targetLevel = Math.min(width, currentLevel * 2)
    zooming = true
    clearTimeout(zoomTimeout)
    ws.zoom(targetLevel)
    var newTotal = ws.getWrapper().scrollWidth
    var newMid = percent * newTotal
    var newScroll = newMid - ws.getWidth() / 2
    if(editing) {
      scrollPosition = newScroll
    }
    ws.setScroll(newScroll)
    zoomTimeout = setTimeout(() => zooming = false, 1000)
  })

  window.addEventListener('sx-controls-zoom-out', _ => {
    var currentScroll = ws.getScroll()
    var total = ws.getWrapper().scrollWidth
    var mid = currentScroll + ws.getWidth() / 2
    var percent = (mid / total)
    var width = Math.floor(document.getElementById('waveform')?.getBoundingClientRect().width || Number.MAX_VALUE)
    var duration = ws.getDuration()
    var zoomedOut = width / duration
    var currentLevel = ws.options.minPxPerSec == 0 ? zoomedOut : ws.options.minPxPerSec
    var targetLevel = Math.max(zoomedOut, currentLevel / 2)
    zooming = true
    clearTimeout(zoomTimeout)
    ws.zoom(targetLevel)
    var newTotal = ws.getWrapper().scrollWidth
    var newMid = percent * newTotal
    var newScroll = newMid - ws.getWidth() / 2
    if(editing) {
      scrollPosition = newScroll
    }
    ws.setScroll(newScroll)
    zoomTimeout = setTimeout(() => zooming = false, 1000)
  })

  window.addEventListener('sx-controls-skip-backward', _ => {
    let songs = Alpine.store('songs') as Songs
    let song = songs.findPrevious(ws.getCurrentTime());
    if(song) {
      ws.setTime(song.startTime + 0.00000001);
    }
  })

  window.addEventListener('sx-controls-skip-forward', _ => {
    let songs = Alpine.store('songs') as Songs
    let song = songs.findNext(ws.getCurrentTime());
    if(song) {
      ws.setTime(song.startTime + 0.00000001);
    }
  })
})

var zooming = false
var editing = false
var scrollPosition: number | undefined = undefined
ws.on('scroll', _ => {
  if(!zooming && editing && scrollPosition) {
    ws.setScroll(scrollPosition)
    return;
  }
})

ws.on('play', () => {
  let controls = Alpine.store('controls') as Controls
  controls.playing = true;
})

ws.on('pause', () => {
  let controls = Alpine.store('controls') as Controls
  controls.playing = false;
})

ws.on('finish', () => {
  let controls = Alpine.store('controls') as Controls
  controls.playing = false;
})

var disableDragSelection : (() => void) | undefined = undefined
window.addEventListener('sx-controls-editing-start', ((e: CustomEventInit<RegionNameUpdate>) => {
  editing = true
  scrollPosition = ws.getScroll()

  document.getElementById('waveform')?.classList.add('inverted')
  ws.setOptions({
    autoScroll: false,
    waveColor: 'white',
    progressColor: 'white',
    cursorColor: 'red'
  })

  var parent = ws.getWrapper().parentElement
  if(parent) {
    parent.style.overflowX = 'hidden'
  }

  disableDragSelection = regions.enableDragSelection({
    // color: 'rgba(206.6, 226, 254.6, 0.5)',
    drag: false
  })

  var rs = regions.getRegions()
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
}) as EventListener)

window.addEventListener('sx-controls-editing-stop', ((e: CustomEventInit<RegionNameUpdate>) => {
  var rs = regions.getRegions()
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

  if(disableDragSelection) {
    disableDragSelection()
    disableDragSelection = undefined
  }

  document.getElementById('waveform')?.classList.remove('inverted')
  ws.setOptions({
    autoScroll: true,
    waveColor: 'black',
    progressColor: 'black',
    cursorColor: 'red'
  })
  var parent = ws.getWrapper().parentElement
  if(parent) {
    parent.style.overflowX = 'auto'
  }


  scrollPosition = undefined
  editing = false
}) as EventListener)

function updateLockedState(region : Region | undefined, song: Song | undefined) {
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
    var prev = regions.getRegions().find((r, _) => r.id == prevNeighbourId)
    lock(prev, 'right')
  }
  if(song.nextNeighbour && song.nextNeighbour.locked) {
    lock(region, 'right')
    var nextNeighbourId = song.nextNeighbour.song.id
    var next = regions.getRegions().find((r, _) => r.id == nextNeighbourId)
    lock(next, 'left')
  }
}

regions.on('region-initialized', region => {
  var el = region.element
  if(el) {
    el.part.add('sx-editable')
    for(var j = 0; j < el.children.length; j++) {
      el.children[j].part.add('sx-editable')
    }
  }
});

regions.on('region-created', (region) => {
  let songs = Alpine.store('songs') as Songs
  let song = songs.create(region.start, region.end);
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

  updateLockedState(region, song)

  ws.setTime(region.start);
})

function findRegion(regionId: string) : Region | undefined {
  return regions.getRegions().find((r, _) => r.id == regionId)
}

regions.on('region-update', (region) => {
  let songs = Alpine.store('songs') as Songs
  let song = songs.find(region.id);

  if(!song) {
    return
  }

  song.update(region.start, region.end)
  region.setOptions({ start: song.startTime, end: song.endTime })

  updateLockedState(region, song)

  if(song.prevNeighbour) {
    var prevRegion = findRegion(song.prevNeighbour.song.id)
    prevRegion?.setOptions({ start: song.prevNeighbour.song.startTime, end: song.prevNeighbour.song.endTime })
    updateLockedState(prevRegion, song.prevNeighbour?.song)
  }

  if(song.nextNeighbour) {
    var nextRegion = findRegion(song.nextNeighbour.song.id)
    nextRegion?.setOptions({ start: song.nextNeighbour.song.startTime, end: song.nextNeighbour.song.endTime })
    updateLockedState(nextRegion, song.nextNeighbour?.song)
  }
})

regions.on('region-updated', (region) => {
  let songs = Alpine.store('songs') as Songs
  let song = songs.find(region.id);

  if(!song) {
    return
  }

  song.lockNeighbours()
  updateLockedState(region, song)

  if(song.prevNeighbour) {
    var prevRegion = findRegion(song.prevNeighbour.song.id)
    updateLockedState(prevRegion, song.prevNeighbour?.song)
  }

  if(song.nextNeighbour) {
    var nextRegion = findRegion(song.nextNeighbour.song.id)
    updateLockedState(nextRegion, song.nextNeighbour?.song)
  }
})

regions.on('region-in', (region) => {
  let songs = Alpine.store('songs') as Songs
  songs.in(region.id)
  for(var i = 0; i < songs.all.length; i++) {
    var song = songs.all[i]
    var r = findRegion(song.id)
    if(song.current) {
      r?.element?.part.add('sx-current')
    } else {
      r?.element?.part.remove('sx-current')
    }
  }
})

regions.on('region-out', (region) => {
  let songs = Alpine.store('songs') as Songs
  songs.out(region.id)
  for(var i = 0; i < songs.all.length; i++) {
    var song = songs.all[i]
    var r = findRegion(song.id)
    if(song.current) {
      r?.element?.part.add('sx-current')
    } else {
      r?.element?.part.remove('sx-current')
    }
  }
})

interface RegionNameUpdate {
  id: string,
  name: string
}

window.addEventListener('sx-song-name-updated', ((e: CustomEventInit<RegionNameUpdate>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail?.id)
  if(r) {
    r.setContent(e.detail?.name || '')
  }
}) as EventListener)