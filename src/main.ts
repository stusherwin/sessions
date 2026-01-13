import './style.css'
import Alpine from 'alpinejs'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'

window.Alpine = Alpine

class Waveform {
  playing: boolean = false
  regions: Region[] = []
  currentRegion: string | undefined
  
  init() {
    this.playing = false
  }

  playPause() {
    this.playing = !this.playing;
  }

  createRegion(id: string, name: string) {
    this.regions = this.regions.concat([new Region(id, name)])
  }

  deleteRegion(id: string) {
    this.regions = this.regions.filter((r, _) => r.id != id)
  }

  getRegion(id: string) {
    return this.regions.find((r, _) => r.id == id)
  }
}

class Region {
  id: string
  _name: string
  loop:boolean
  get name() {
    return this._name
  }
  set name(value: string) {
    this._name = value
    dispatchEvent(new CustomEvent('region-updated', { detail: this }))
  }
  constructor(id: string, name: string) {
    this.id = id
    this._name = name
    this.loop = false
  }
}

Alpine.store('waveform', new Waveform())

Alpine.start()

const regions = RegionsPlugin.create()

const ws = WaveSurfer.create({
  container: '#waveform',
  waveColor: '#4F4A85',
  progressColor: '#383351',
  url: '/example.mp3',
  plugins: [regions],
})

window.addEventListener('play-pause', _ => {
  ws.playPause();
})

const random = (min: number, max: number) => Math.random() * (max - min) + min
const randomColor = () => `rgba(${random(0, 255)}, ${random(0, 255)}, ${random(0, 255)}, 0.5)`

ws.on('decode', () => {
  // Regions
  regions.addRegion({
    start: 0,
    end: 8,
    content: 'Resize me',
    color: randomColor(),
    drag: true,
    resize: true,
  })
})

regions.enableDragSelection({
  content: 'New region',
  color: 'rgba(255, 0, 0, 0.1)',
})

regions.on('region-clicked', (region, e) => {
  e.stopPropagation()
  region.play(true)
  region.setOptions({ color: randomColor() })
})

regions.on('region-in', (region) => {
  (Alpine.store('waveform') as Waveform).currentRegion = region.id
})

regions.on('region-out', (region) => {
  var wf = Alpine.store('waveform') as Waveform
  var r = wf.getRegion(region.id)
  if(r && r.loop && wf.currentRegion == region.id) {
    region.play(true)
  }
  else if(wf.currentRegion == region.id)
  {
    wf.currentRegion = undefined
  }
})

regions.on('region-created', (region) => {
  (Alpine.store('waveform') as Waveform).createRegion(region.id, region.content?.innerText || '');
})

ws.on('play', () => {
  (Alpine.store('waveform') as Waveform).playing = true;
})

ws.on('pause', () => {
  (Alpine.store('waveform') as Waveform).playing = false;
})

ws.on('finish', () => {
  (Alpine.store('waveform') as Waveform).playing = false;
})

regions.on('region-update', (_) => {
  console.log('update')
})

regions.on('region-updated', (_) => {
  console.log('updated')
})

window.addEventListener('region-updated', ((e: CustomEventInit<Region>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail?.id)
  if(r && r.content)
  {
    r.content.innerText = e.detail?.name || ''
  }
}) as EventListener)

window.addEventListener('play-region', ((e: CustomEventInit<string>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail)
  if(r)
  {
    r.play(true)
  }
}) as EventListener)


window.addEventListener('delete-region', ((e: CustomEventInit<string>) => {
  var r = regions.getRegions().find((r, _) => r.id == e.detail)
  if(r)
  {
    r.remove();
    (Alpine.store('waveform') as Waveform).deleteRegion(r.id)
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