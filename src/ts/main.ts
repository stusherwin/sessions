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

class Player {
  playing: boolean = false
  
  init() {
    this.playing = false
  }

  playFromStart() {
    dispatchEvent(new CustomEvent('sx-player-play-from-start', { detail: this }))
  }

  skipToStart() {
    dispatchEvent(new CustomEvent('sx-player-skip-to-start', { detail: this }))
  }

  skipToEnd() {
    dispatchEvent(new CustomEvent('sx-player-skip-to-end', { detail: this }))
  }

  playPause() {
    dispatchEvent(new CustomEvent('sx-player-play-pause', { detail: this }))
  }
}


class Songs {
  all: Song[] = []
  nextSongId: number = 1
  
  init() {
  }

  create(startTime: number, endTime: number) {
    console.log('create()')

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

    for(i = 0; i < this.all.length; i++) {
      let song = this.all[i]
      console.log(song.id)
      console.log('prev: ' + (song.prevNeighbour ? '(' + song.prevNeighbour.song.id + ', ' + (song.prevNeighbour.locked ? 'locked' : 'unlocked') + ')' : ''))
      console.log('next: ' + (song.nextNeighbour ? '(' + song.nextNeighbour.song.id + ', ' + (song.nextNeighbour.locked ? 'locked' : 'unlocked') + ')' : ''))
    }
      
    return newSong
  }

  find(id: string) : Song | undefined {
    return this.all.find(s => s.id == id)
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

Alpine.store('player', new Player())
Alpine.store('songs', new Songs())
Alpine.start()

const regions = RegionsPlugin.create()

const ws = WaveSurfer.create({
  container: '#waveform',
  waveColor: '#4F4A85',
  progressColor: '#383351',
  url: '/session1.mp3',
  plugins: [regions],
})

window.addEventListener('sx-player-play-pause', _ => {
  ws.playPause();
})

window.addEventListener('sx-player-play-from-start', _ => {
  ws.setTime(0);
  ws.play();
})

window.addEventListener('sx-player-skip-to-start', _ => {
  ws.setTime(0);
})

window.addEventListener('sx-player-skip-to-end', _ => {
  ws.seekTo(1);
})

ws.on('play', () => {
  let player = Alpine.store('player') as Player
  player.playing = true;
})

ws.on('pause', () => {
  let player = Alpine.store('player') as Player
  player.playing = false;
})

ws.on('finish', () => {
  let player = Alpine.store('player') as Player
  player.playing = false;
})

regions.enableDragSelection({
  color: 'rgba(206.6, 226, 254.6, 0.5)',
  drag: false
})

function updateLockedState(region : Region | undefined, song: Song | undefined) {
  if(!song || !region) {
    return
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

regions.on('region-created', (region) => {
  let songs = Alpine.store('songs') as Songs
  let song = songs.create(region.start, region.end);
  if(!song) {
    region.remove()
    return
  }

  region.setOptions({ id : song.id, content: song.name, start: song.startTime, end: song.endTime })
  region.element?.part.add('sx-song')
  updateLockedState(region, song)

  ws.setTime(region.start);
})

function findRegion(regionId: string) : Region | undefined {
  return regions.getRegions().find((r, _) => r.id == regionId)
}

regions.on('region-update', (region) => {
  console.log('updating ' + region.id)
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
  console.log('updated ' + region.id)

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
  console.log('in: ' + region.id)
  let songs = Alpine.store('songs') as Songs
  songs.in(region.id)
})

regions.on('region-out', (region) => {
  console.log('out: ' + region.id)
  let songs = Alpine.store('songs') as Songs
  songs.out(region.id)
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
