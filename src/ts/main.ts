import Alpine from 'alpinejs'
import persist from '@alpinejs/persist'
import '../scss/styles.scss'
import iconsRaw from 'bootstrap-icons/bootstrap-icons.svg?raw'
import WaveSurfer from 'wavesurfer.js'
// import type { Region } from 'wavesurfer.js/dist/plugins/regions.esm.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'

var allSvg = document.getElementById('all')
if(allSvg) {
  allSvg.innerHTML = iconsRaw;
}

window.Alpine = Alpine
Alpine.plugin(persist)

// type App = {
//     init: () => void,
//     sessions: SessionData[], 
//     tunes: TuneData[],
//     waveform: WaveformData | undefined 
//     loadWaveform: (session: SessionData) => void
// }

interface WaveformData {
  ready: boolean
  loading: number
  sessionId: string
  sessionName: string
}

interface AppData {
  sessions: SessionData[]
  tunes: TuneData[]
}

interface SessionData {
  id: string,
  name: string,
  filename: string,
  peaks: number[][] | undefined,
  duration: number | undefined,
  tunes: TunePerformanceData[]
}

interface TuneData {
  id: string
  name: string
  performances: TunePerformanceData[]
}

interface TunePerformanceData {
  id: string
  tuneId: string
  tuneName: string
  sessionId: string
  sessionName: string
  startTime: number
  endTime: number
}

document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({ 
      init() {
        console.log('init')
        window.fetch(new Request("/sessions.json"))
          .then((response) => {
              if(!response.ok) { 
                  throw new Error('JSON file not found');
              }

              return response.json() as Promise<AppData>
          })
          .then((data : AppData) => {
              console.log(data)
              this.sessions = data.sessions
              this.tunes = data.tunes
          })
          .catch(err => {
              console.error(err)
          })
          .finally(() => {
          })
      },
      sessions: [] as SessionData[], 
      tunes: [] as TuneData[], 
      waveform: undefined as WaveformData | undefined,
      loadWaveform(session: SessionData) {
        if(this.waveform) {
          this.waveform.ready = false
          this.waveform.loading = 0
          this.$dispatch('sx-unload-waveform', this.waveform.sessionId)
          this.waveform = undefined
        }

        this.waveform = {
          sessionId: session.id,
          sessionName: session.name,
          ready: false,
          loading: 0
        }

        this.$dispatch('sx-load-waveform', session.id)
      }
    }))
})

Alpine.start()

class Waveform {
  session: SessionData
  containerSelector: string
  regions: RegionsPlugin | undefined
  ws: WaveSurfer | undefined
  subscriptions: (() => void)[] = []

  constructor(session: SessionData) {
    this.containerSelector = '.waveform[data-session-id="' + session.id + '"]'
    this.session = session
  }

  load() {
    console.log(this.session.id + ': load waveform...')
    var timeout = setTimeout(() => {
      console.log(this.session.id + ': after timeout')
      console.log(this.containerSelector)
      var el = document.querySelector(this.containerSelector)
      console.log(el)
      console.log(this.session.peaks)
      this.regions = RegionsPlugin.create()
      this.ws = WaveSurfer.create({
          container: this.containerSelector,
          waveColor: 'black',
          progressColor: 'black',
          cursorColor: 'red',
          url: '/' + this.session.filename,
          plugins: [this.regions],
          peaks: this.session.peaks,
          duration: this.session.duration
      })

      this.subscriptions.push(this.ws.on('loading', percent => 
        dispatchEvent(new CustomEvent('sx-waveform-loading', { detail: { id: this.session.id, loading: percent } }))))

      this.subscriptions.push(this.ws.once('decode', () => {
        console.log('decode')
        if(!this.ws || !this.regions) {
            return
        }

        console.log(this.session.id + ': on decode')

        dispatchEvent(new CustomEvent('sx-waveform-ready', { detail: { id: this.session.id } }))

        for(var i = 0; i < this.session.tunes.length; i++) {
            var tune = this.session.tunes[i];
            var prevTune = i > 0 ? this.session.tunes[i - 1] : undefined;
            var nextTune = i < this.session.tunes.length - 1 ? this.session.tunes[i + 1] : undefined;
            var region = this.regions.addRegion({ 
                id: tune.id, 
                content: tune.tuneName, 
                start: tune.startTime, 
                end: tune.endTime, 
                drag: false, 
                resize: false 
            })
            region.element?.part.add('sx-tune')
            if(prevTune && prevTune.endTime == tune.startTime) {
                region.element?.part.add('sx-locked-left')
            }
            if(nextTune && nextTune.startTime == tune.endTime) {
                region.element?.part.add('sx-locked-right')
            }
        }
      }))

      clearTimeout(timeout)
    })
  }

  unload() {
    console.log(this.session.id + ': unload waveform...')
    for(var i = 0; i < this.subscriptions.length; i++) {
        this.subscriptions[i]();
    }
    this.subscriptions = [];
    if(!this.ws) {
        return
    }
    this.ws.destroy();
    this.ws = undefined;
  }
}

declare global {
  // Note the capital "W"
  interface Window { 
    waveforms: { [key: string]: Waveform }
  }
}
window.waveforms = {}

window.fetch(new Request("/sessions.json"))
  .then((response) => {
      if(!response.ok) { 
          throw new Error('JSON file not found');
      }

      return response.json() as Promise<AppData>
  })
  .then((data : AppData) => {
      console.log(data)
      for(const session of data.sessions) {
        window.waveforms[session.id] = new Waveform(session)
      }
  })
  .catch(err => {
      console.error(err)
  })
  .finally(() => {
  })

window.addEventListener('sx-load-waveform', ((e: CustomEventInit<string>) => {
  console.log('sx-load-waveform')
  console.log(e.detail)
  if(!e.detail) {
    return;
  }
  var waveform = window.waveforms[e.detail]
  waveform.load()
}) as EventListener)

window.addEventListener('sx-unload-waveform', ((e: CustomEventInit<string>) => {
  console.log('sx-unload-waveform')
  console.log(e.detail)
  if(!e.detail) {
    return;
  }
  var waveform = window.waveforms[e.detail]
  waveform.unload()
}) as EventListener)
