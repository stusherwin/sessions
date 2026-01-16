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

  playFromStart() {
    dispatchEvent(new CustomEvent('sx-player-play-from-start', { detail: this }))
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

  create(regionId: string, startTime: number, endTime: number) {
    for(var j = 0; j < this.all.length; j++) {
      var s = this.all[j]
      console.log(j + ': ' + s.name + ' (' + s.startTime + ' - ' + s.endTime + ')')
    }

    let i = this.all.findIndex(s => s.startTime > startTime)
    let id = '' + this.nextSongId++
    var song = new Song(id, regionId, 'Song ' + id, startTime, endTime, this)
    console.log(song.name + ' (' + song.startTime + ' - ' + song.endTime + ')')
    console.log(i)

    this.all = i > -1
      ? this.all.slice(0, i).concat(song, this.all.slice(i))
      : this.all.concat(song)
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
  startTime: number
  endTime: number
  loop: boolean = false
  current: boolean = false
  selected: boolean = false
  sections: Section[] = []
  songs: Songs
  nextSectionId: number = 1

  constructor(id: string, regionId: string, name: string, startTime: number, endTime: number, songs: Songs) {
    this.id = id
    this.regionId = regionId
    this._name = name
    this.songs = songs
    this.startTime = startTime
    this.endTime = endTime
    this.select()
    dispatchEvent(new CustomEvent('sx-region-name-updated', { detail: this }))
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

  split(splitPoint: number, regionAId: string, regionBId: string) {
    if(!this.sections.length) {
      if(this.startTime < splitPoint && splitPoint < this.endTime) {
        var a = new Section(this.nextSectionId++ + '', regionAId, 'A', this.startTime, splitPoint, this)
        var b = new Section(this.nextSectionId++ + '', regionBId, 'B', splitPoint, this.endTime, this)
        this.sections = [a, b]
      }
    }
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
  startTime: number
  endTime: number
  loop: boolean = false
  current: boolean = false
  selected: boolean = false
  song: Song

  constructor(id: string, regionId: string, name: string, startTime: number, endTime: number, song: Song) {
    this.id = id
    this.regionId = regionId
    this._name = name
    this.song = song
    this.startTime = startTime
    this.endTime = endTime
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

window.addEventListener('sx-player-play-from-start', _ => {
  ws.setTime(0);
  ws.play();
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

console.log('regions.enableDragSelection()')

regions.enableDragSelection({
  // content: 'Song X',
  color: 'rgba(255, 0, 0, 0.1)',
  drag: false
})

// regions.enableDragSelection({
//   //content: 'Song Y',
//   color: 'rgba(255, 0, 0, 0.1)',
// })

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

var splitting = false
regions.on('region-created', (region) => {
  let songs = Alpine.store('songs') as Songs
  if(!splitting) {
    songs.create(region.id, region.start, region.end);
  }
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

window.addEventListener('sx-split', ((e: CustomEventInit<string>) => {
  splitting = true
  var splitPoint = ws.getCurrentTime()
  let songs = Alpine.store('songs') as Songs
  var s = songs.findByRegion(e.detail || '')
  if(s instanceof Song) {
    if(s.startTime < splitPoint && splitPoint < s.endTime) {
      if(!s.sections.length) {
        var r = regions.getRegions().find((r, _) => r.id == e.detail)
        if(r) {
          if(r.start < splitPoint && splitPoint < r.end) {
            var regionA = regions.addRegion({
              start: r.start,
              end: splitPoint,
              color: r.color,
              content: 'A',
              drag: false
            })
            var regionB = regions.addRegion({
              start: splitPoint,
              end: r.end,
              color: r.color,
              content: 'B',
              drag: false
            })
            s.split(splitPoint, regionA.id, regionB.id)
          }
        }        
      }
    }
    splitting = false
  }

  // var r = regions.getRegions().find((r, _) => r.id == e.detail)
  // if(r) {
  //   var end = r.end
  //   if(r.start < splitPoint && splitPoint < r.end) {
  //     r.setOptions({
  //       end: splitPoint,
  //       content: 'Before split'
  //     })
  //     regions.addRegion({
  //       start: splitPoint,
  //       end: end,
  //       color: r.color,
  //       content: 'After split'
  //     })
  //   }
  // }
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