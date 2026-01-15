import './style.css'
import Alpine from 'alpinejs'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'

window.Alpine = Alpine

class Player {
  playing: boolean = false
  
  init() {
    this.playing = false
  }

  playPause() {
    this.playing = !this.playing;
    dispatchEvent(new CustomEvent('sx-player-play-pause', { detail: this }))
  }
}

class Songs {
  all: Song[] = []
  nextSongId: number = 1
  
  init() {
  }

  create(regionId: string, name: string) {
    this.all = this.all.concat([new Song(this.nextSongId++ + '', regionId, name, this)])
  }

  findByRegion(regionId: string) : Song | Section | undefined {
    var found = undefined as Song | Section | undefined
    for(var i = 0; i < this.all.length; i++) {
      let song = this.all[i]
      if(song.regionId === regionId) {
        found = song
        break
      } else {
        for(var j = 0; j < song.sections.length; j++) {
          let section = song.sections[j]
          if(section.regionId === regionId) {
            found = section
            break
          }
        }
      }
    }
    return found
  }

  setCurrent(regionId: string) {
    this.all.forEach(song => {
      var currentSong = song.regionId === regionId
      song.sections.forEach(section => {
        section.current = section.regionId === regionId
        if(section.current) {
          currentSong = true
        }        
      })
      song.current = currentSong
    })
  }

  songSelected(songId: string) {
    for(var i = 0; i < this.all.length; i++) {
      if(this.all[i].id !== songId) {
        this.all[i].deselect()
      }
    }
  }

  songRemoved(songId: string) {
    this.all = this.all.filter((s, _) => s.id !== songId)
  }
}

class Song {
  id: string
  regionId: string
  _name: string
  loop: boolean = false
  current: boolean = false
  selected: boolean = false
  sections: Section[] = []
  songs: Songs
  nextSectionId: number = 1

  constructor(id: string, regionId: string, name: string, songs: Songs) {
    this.id = id
    this.regionId = regionId
    this._name = name
    this.songs = songs
    this.select()
  }

  get name() {
    return this._name
  }

  set name(value: string) {
    this._name = value
    dispatchEvent(new CustomEvent('sx-region-name-updated', { detail: this }))
  }

  playFromStart() {
    dispatchEvent(new CustomEvent('sx-region-play-from-start', { detail: this.regionId }))
  }

  select() {
    this.selected = true
    dispatchEvent(new CustomEvent('sx-region-selected', { detail: this.regionId }))
    this.songs.songSelected(this.id)
  }

  deselect() {
    this.selected = false
    dispatchEvent(new CustomEvent('sx-region-deselected', { detail: this.regionId }))
  }

  sectionSelected(sectionId: string) {
    for(var i = 0; i < this.sections.length; i++) {
      if(this.sections[i].id !== sectionId) {
        this.sections[i].deselect()
      }
    }
  }

  sectionRemoved(sectionId: string) {
    this.sections = this.sections.filter((s, _) => s.id !== sectionId)
  }

  remove() {
    let sections = [...this.sections]
    for(var i = 0; i < sections.length; i++) {
      let section = sections[i]
      section.remove()
    }
    dispatchEvent(new CustomEvent('sx-region-deleted', { detail: this.regionId }))
    this.songs.songRemoved(this.id)
  }

}

class Section {
  id: string
  regionId: string
  _name: string
  loop: boolean = false
  current: boolean = false
  selected: boolean = false
  song: Song

  constructor(id: string, regionId: string, name: string, song: Song) {
    this.id = id
    this.regionId = regionId
    this._name = name
    this.song = song
    this.select()
  }

  get name() {
    return this._name
  }

  set name(value: string) {
    this._name = value
    dispatchEvent(new CustomEvent('sx-region-name-updated', { detail: this }))
  }

  select() {
    this.selected = true
    dispatchEvent(new CustomEvent('sx-region-selected', { detail: this }))
    this.song.sectionSelected(this.id)
  }

  deselect() {
    this.selected = false
    dispatchEvent(new CustomEvent('sx-region-deselected', { detail: this }))
  }

  playFromStart() {
    dispatchEvent(new CustomEvent('sx-region-play-from-start', { detail: this.regionId }))
  }

  remove() {
    dispatchEvent(new CustomEvent('sx-region-deleted', { detail: this.regionId }))
    this.song.sectionRemoved(this.id)
  }
}

Alpine.store('player', new Player())
Alpine.store('songs', new Songs())

Alpine.start()

const regions = RegionsPlugin.create()

const ws = WaveSurfer.create({
  container: '#waveform',
  waveColor: '#4F4A85',
  progressColor: '#383351',
  url: '/example.mp3',
  plugins: [regions],
})

ws.on('decode', () => {
})

window.addEventListener('sx-player-play-pause', _ => {
  ws.playPause();
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
  content: 'New song',
  color: 'rgba(255, 0, 0, 0.1)',
})

regions.on('region-clicked', (region) => {
  let songs = Alpine.store('songs') as Songs
  var r = songs.findByRegion(region.id)
  if(r) {
    r.select()
  }
})

regions.on('region-in', (region) => {
  let songs = Alpine.store('songs') as Songs
  songs.setCurrent(region.id)
})

regions.on('region-out', (region) => {
  let songs = Alpine.store('songs') as Songs
  var r = songs.findByRegion(region.id)
  if(r && r.loop && r.current) {
    region.play(true)
  }
  else if(r && r.current) {
    r.current = false
  }
})

regions.on('region-created', (region) => {
  let songs = Alpine.store('songs') as Songs
  songs.create(region.id, region.content?.innerText || '');
})

regions.on('region-update', (_) => {
  console.log('update')
})

regions.on('region-updated', (_) => {
  console.log('updated')
})

window.addEventListener('sx-region-name-updated', ((e: CustomEventInit<Song>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail?.regionId)
  if(r) {
    r.setContent(e.detail?.name || '')
  }
}) as EventListener)

window.addEventListener('sx-region-play-from-start', ((e: CustomEventInit<string>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail)
  if(r) {
    r.play(true)
  }
}) as EventListener)

window.addEventListener('sx-region-deleted', ((e: CustomEventInit<string>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail)
  if(r) {
    r.remove();
  }
}) as EventListener)

window.addEventListener('sx-region-selected', ((e: CustomEventInit<string>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail)
  if(r) {
    r.setOptions({
      color: 'rgba(255, 0, 0, 0.1)'
    })
  }
}) as EventListener)

window.addEventListener('sx-region-deselected', ((e: CustomEventInit<string>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail)
  if(r) {
    r.setOptions({
      color: 'rgba(0, 0, 0, 0.1)'
    })
  }
}) as EventListener)

window.addEventListener('shunt-region-left', ((e: CustomEventInit<string>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail)
  if(r)
  {
    var length = r.end - r.start
    if(r.start >= length)
    {
      r.setOptions({
        start: r.start - length,
        end: r.end - length
      })
    }
  }
}) as EventListener)


window.addEventListener('shunt-region-right', ((e: CustomEventInit<string>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail)
  if(r)
  {
    var length = r.end - r.start
    if(r.end + length <= ws.getDuration())
    {
      r.setOptions({
        start: r.start + length,
        end: r.end + length
      })
    }
  }
}) as EventListener)


window.addEventListener('copy-region', ((e: CustomEventInit<string>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail)
  if(r)
  {
    var length = r.end - r.start
    if(r.end + length <= ws.getDuration())
    {
      regions.addRegion({
        start: r.end,
        end: r.end + length,
        color: r.color,
        content: 'Copy'
      })
    }
  }
}) as EventListener)

window.addEventListener('split-region', ((e: CustomEventInit<string>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail)
  if(r) {
    var splitPoint = ws.getCurrentTime()
    var end = r.end
    if(r.start < splitPoint && splitPoint < r.end) {
      r.setOptions({
        end: splitPoint,
        content: 'Before split'
      })
      regions.addRegion({
        start: splitPoint,
        end: end,
        color: r.color,
        content: 'After split'
      })
    }
  }
}) as EventListener)

const nudge = 0.05
window.addEventListener('nudge-region-left', ((e: CustomEventInit<string>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail)
  if(r)
  {
    if(r.start >= nudge)
    {
      r.setOptions({
        start: r.start - nudge,
        end: r.end - nudge
      })
    }
  }
}) as EventListener)


window.addEventListener('nudge-region-right', ((e: CustomEventInit<string>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail)
  if(r)
  {
    if(r.end + nudge <= ws.getDuration())
    {
      r.setOptions({
        start: r.start + nudge,
        end: r.end + nudge
      })
    }
  }
}) as EventListener)