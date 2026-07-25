import Alpine from 'alpinejs'
import persist from '@alpinejs/persist'
import '../css/styles.css'
import iconsRaw from 'bootstrap-icons/bootstrap-icons.svg?raw'
import App from './app.ts'
import type { WaveformData } from './waveform-manager.ts'
import { WaveformManager } from './waveform-manager.ts'
import { listen, dispatch } from './common.ts'

var allSvg = document.getElementById('all')
if(allSvg) {
  allSvg.innerHTML = iconsRaw;
}

window.Alpine = Alpine
Alpine.plugin(persist)

document.addEventListener('alpine:init', () => {
  Alpine.data('app', App)
})

Alpine.start()

declare global {
  interface Window { 
    waveform: WaveformManager | undefined
  }
}
window.waveform = undefined

listen('sx:waveform-loading', (data: WaveformData) =>
  setTimeout(() => {
    if(data.session.processed) {
      window.fetch(new Request(`/api/session/${data.session.id}/peaks`))
        .then((response) => {
          if(!response.ok) { 
              throw new Error('JSON file not found');
          }

          return response.json() as Promise<number[][]>
        })
        .then((peaks : number[][]) => {
          window.waveform = new WaveformManager(data, peaks)
        })
    } else {
        window.waveform = new WaveformManager(data, undefined)
    }
  }))

listen('sx:waveform-unloading', (sessionId: string) => {
  if(window.waveform && window.waveform.sessionId == sessionId) {
    window.waveform.unload()
  }
})

const eventSource = new EventSource('/api/tasks/progress');

eventSource.addEventListener('task-progress', (event) => {
  const payload = JSON.parse(event.data)
  dispatch('sx:task-progress', payload)
});
