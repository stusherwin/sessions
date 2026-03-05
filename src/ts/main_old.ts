// import './style.css'
import Alpine from 'alpinejs'
import WaveSurfer from 'wavesurfer.js'
import type { Region } from 'wavesurfer.js/dist/plugins/regions.esm.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import '../scss/styles.scss'
import iconsRaw from 'bootstrap-icons/bootstrap-icons.svg?raw'

const delta = 0.05;

// Import all of Bootstrap’s JS
//import * as bootstrap from 'bootstrap'

// declare global {
//     // Note the capital "W"
//     interface Window { Stu: any; }
// }

// window.Stu = window.Stu || {};
// window.Stu.globalName = 'Stu'

var allSvg = document.getElementById('all')
if(allSvg) {
  allSvg.innerHTML = iconsRaw;
}

window.Alpine = Alpine

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

var nextSongId: number = 1
var nextSectionId: number = 1

class Songs {
  all: Song[] = []
  
  init() {
  }

  create(startTime: number, endTime: number) {
    for(var j = 0; j < this.all.length; j++) {
      var s = this.all[j]
      console.log(j + ': ' + s.name + ' (' + s.startTime + ' - ' + s.endTime + ')')
    }

    let i = this.all.findIndex(s => s.startTime > startTime)
    let id = 'song-' + nextSongId
    var song = new Song(id, 'Song ' + nextSongId, startTime, endTime, this)
    nextSongId++
    console.log(song.name + ' (' + song.startTime + ' - ' + song.endTime + ')')
    console.log(i)

    this.all.push(song);
    // this.all = i > -1
    //   ? this.all.slice(0, i).concat(song, this.all.slice(i))
    //   : this.all.concat(song)
      
    return song
  }

  findByRegion(regionId: string) : Song | Section | undefined {
    var found = undefined as Song | Section | undefined
    for(var i = 0; i < this.all.length; i++) {
      let song = this.all[i]
      if(song.id === regionId) {
        found = song
        break
      } else {
        for(var j = 0; j < song.sections.length; j++) {
          let section = song.sections[j]
          if(section.id === regionId) {
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
      var currentSong = song.id === regionId
      song.sections.forEach(section => {
        section.current = section.id === regionId
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
  _name: string
  startTime: number
  endTime: number
  loop: boolean = false
  current: boolean = false
  selected: boolean = false
  sections: Section[] = []
  songs: Songs

  constructor(id: string, name: string, startTime: number, endTime: number, songs: Songs) {
    this.id = id
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
    console.log('name: ' + value)

    dispatchEvent(new CustomEvent('sx-region-name-updated', { detail: this }))
  }

  playFromStart() {
    console.log('song.playFromStart()')

    dispatchEvent(new CustomEvent('sx-region-play-from-start', { detail: this.id }))
  }

  skipToStart() {
    dispatchEvent(new CustomEvent('sx-region-skip-to-start', { detail: this.id }))
  }

  skipToEnd() {
    dispatchEvent(new CustomEvent('sx-region-skip-to-end', { detail: this.id }))
  }

  select() {
    this.selected = true
    dispatchEvent(new CustomEvent('sx-region-selected', { detail: this.id }))
    this.songs.songSelected(this.id)
  }

  deselect() {
    this.selected = false
    dispatchEvent(new CustomEvent('sx-region-deselected', { detail: this.id }))
  }

  split(splitPoint: number) {
    // if(!this.sections.length) {
    //   if(this.startTime < splitPoint && splitPoint < this.endTime) {
    //     var a = new Section('section-' + nextSectionId++, 'A', this.startTime, splitPoint, this)
    //     var b = new Section('section-' + nextSectionId++, 'B', splitPoint, this.endTime, this)
    //     this.sections = [a, b]
    //   }
    // }
    console.log('startTime: ' + this.startTime)
    console.log('splitPoint: ' + splitPoint)
    console.log('endTime: ' + this.endTime)
    console.log((this.startTime + delta) + ' < ' + splitPoint + ' < ' + (this.endTime - delta))
    if(this.startTime + delta < splitPoint && splitPoint < this.endTime - delta) {
      if(!this.sections.length) {
        var a = new Section('section-' + nextSectionId++, 'A', this.startTime, splitPoint, this)
        var b = new Section('section-' + nextSectionId++, 'B', splitPoint, this.endTime, this)
        this.sections = [a, b]
      } else {
        let newSections = []
        var hasSplit = false
        for(var i = 0; i < this.sections.length; i++) {
          let section = this.sections[i]
          newSections.push(section)
          if(hasSplit) {
            section.name = String.fromCharCode(65 + i + 1)
          }

          console.log((section.startTime + delta) + ' < ' + splitPoint + ' < ' + (section.endTime - delta))
          if(section.startTime + delta < splitPoint && splitPoint < section.endTime - delta) {
            newSections.push(new Section('section-' + nextSectionId++, String.fromCharCode(65 + i + 1), splitPoint, section.endTime, this))
            section.endTime = splitPoint;
            hasSplit = true
          }
        }
        this.sections = newSections
      }
      return true;
    }

    return false;
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
    dispatchEvent(new CustomEvent('sx-region-deleted', { detail: this.id }))
    this.songs.songRemoved(this.id)
  }

}

class Section {
  id: string
  _name: string
  startTime: number
  endTime: number
  loop: boolean = false
  current: boolean = false
  selected: boolean = false
  song: Song

  constructor(id: string, name: string, startTime: number, endTime: number, song: Song) {
    this.id = id
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
    console.log('name: ' + value)
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
    console.log('section.playFromStart()')
    dispatchEvent(new CustomEvent('sx-region-play-from-start', { detail: this.id }))
  }

  skipToStart() {
    dispatchEvent(new CustomEvent('sx-region-skip-to-start', { detail: this.id }))
  }

  skipToEnd() {
    dispatchEvent(new CustomEvent('sx-region-skip-to-end', { detail: this.id }))
  }

  remove() {
    dispatchEvent(new CustomEvent('sx-region-deleted', { detail: this.id }))
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
  url: '/session1.mp3',
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

console.log('regions.enableDragSelection()')

regions.enableDragSelection({
  // content: 'Song X',
  color: 'rgba(206.6, 226, 254.6, 0.5)',
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
  console.log('in: ' + region.id)
  let songs = Alpine.store('songs') as Songs
  songs.setCurrent(region.id)
})

regions.on('region-out', (region) => {
  console.log('out: ' + region.id)
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
    let song = songs.create(region.start, region.end);
    console.log(song);
    console.log(songs);
    region.setOptions({ id : song.id, content: song.name })
    region.element?.part.add('sx-song')
    ws.setTime(region.start);
  }
})

regions.on('region-update', (region) => {
  console.log('updating ' + region.id)

  if(region.element?.part.contains('sx-section')) {
    if(region.element?.dataset.prevNeighbour) {
        var prev = regions.getRegions().find((r, _) => r.id == region.element?.dataset.prevNeighbour)
        if(prev && region.start != prev.end) {
          prev.setOptions({end : region.start})
          prev.element?.part.add('sx-section')
        }
    } else {
        var song = regions.getRegions().find((r, _) => r.id == region.element?.dataset.songId)
        if(song) {
          song.setOptions({start : region.start})
          song.element?.part.add('sx-section')
        }
    }
    if(region.element?.dataset.nextNeighbour) {
      var next = regions.getRegions().find((r, _) => r.id == region.element?.dataset.nextNeighbour)
      if(next && region.end != next.start) {
        next.setOptions({start : region.end})
        next.element?.part.add('sx-section')
      }
    } else {
        var song = regions.getRegions().find((r, _) => r.id == region.element?.dataset.songId)
        if(song) {
          song.setOptions({end : region.end})
          song.element?.part.add('sx-section')
        }
    }
  }
  if(region.element?.part.contains('sx-song')) {
    var sections = regions.getRegions().filter((r, _) => r.element?.dataset.songId == region.id)
      var first: Region | undefined = undefined
      var last: Region | undefined = undefined
      for(var i = 0; i < sections.length; i++) {
        if(!first || first.start > sections[i].start) {
          first = sections[i]
        }
        if(!last || last.end < sections[i].end) {
          last = sections[i]
        }
      }
      if(first) {
        first.setOptions({start : region.start})
        first.element?.part.add('sx-section')
      }
      if(last) {
        last.setOptions({end : region.end})
        last.element?.part.add('sx-section')
      }
  }
})

regions.on('region-updated', (region) => {
  console.log('updated')
})

window.addEventListener('sx-region-name-updated', ((e: CustomEventInit<Song>) => {
  console.log('sx-region-name-updated')
  console.log(e.detail)
  var r = regions.getRegions().find((r, _) => r.id == e.detail?.id)
  if(r) {
    r.setContent(e.detail?.name || '')
  }
}) as EventListener)

window.addEventListener('sx-region-play-from-start', ((e: CustomEventInit<string>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail)
  if(r) {
    r.play()
  }
}) as EventListener)

window.addEventListener('sx-region-skip-to-start', ((e: CustomEventInit<string>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail)
  if(r) {
    ws.setTime(r.start)
  }
}) as EventListener)

window.addEventListener('sx-region-skip-to-end', ((e: CustomEventInit<string>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail)
  if(r) {
    ws.setTime(r.end)
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
      color: 'rgba(206.6, 226, 254.6, 0.5)',
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
    if(s.split(splitPoint)) {
      var sectionRegions = regions.getRegions().filter((r, _) => r.element?.dataset.songId == e.detail)
      for(var i = 0; i < s.sections.length; i++) {
        let section = s.sections[i]
        let sectionRegion = sectionRegions.find(r => r.id == section.id)
        if(sectionRegion) {
          sectionRegion.setOptions({
            start: section.startTime,
            end: section.endTime,
            // color: 'rgba(255,0,0,0.5)',
            content: section.name,
            // drag: false,
            id: section.id
          })
        } else {
          sectionRegion = regions.addRegion({
            start: section.startTime,
            end: section.endTime,
            color: 'rgba(255,0,0,0.5)',
            content: section.name,
            drag: false,
            id: section.id
          })
        }
        if(sectionRegion.content && sectionRegion.element)
        {
          sectionRegion.element.part.add('sx-section')
          sectionRegion.content.part.add('sx-section')
          sectionRegion.element.dataset.songId = s.id
          if(i > 0) {
            sectionRegion.element.dataset.prevNeighbour = s.sections[i - 1].id
          }
          if(i < s.sections.length - 1) {
            sectionRegion.element.dataset.nextNeighbour = s.sections[i + 1].id
          }
        }
      }
    }
    // if(s.startTime < splitPoint && splitPoint < s.endTime) {
    //   if(!s.sections.length) {
    //     var r = regions.getRegions().find((r, _) => r.id == e.detail)
    //     if(r) {
    //       if(r.start < splitPoint && splitPoint < r.end) {
    //         s.split(splitPoint)
    //         if(ids) {
    //           var regionA = regions.addRegion({
    //             start: r.start,
    //             end: splitPoint,
    //             color: r.color,
    //             content: 'A',
    //             drag: false,
    //             id: ids.aId
    //           })
    //           if(regionA.content && regionA.element)
    //           {
    //             regionA.element.part.add('sx-section')
    //             regionA.content.part.add('sx-section')
    //             regionA.element.dataset.songId = s.id
    //             regionA.element.dataset.nextNeighbour = ids.bId
    //           }
    //           var regionB = regions.addRegion({
    //             start: splitPoint,
    //             end: r.end,
    //             color: r.color,
    //             content: 'B',
    //             drag: false,
    //             id: ids.bId
    //           })
    //           if(regionB.content && regionB.element)
    //           {
    //             regionB.element.part.add('sx-section')
    //             regionB.content.part.add('sx-section')
    //             regionB.element.dataset.songId = s.id
    //             regionB.element.dataset.prevNeighbour = ids.aId
    //           }
    //         }
    //       }
    //     }        
    //   } else {

    //   }
    // }
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