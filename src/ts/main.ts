import Alpine from 'alpinejs'
import persist from '@alpinejs/persist'
import '../scss/styles.scss'
import iconsRaw from 'bootstrap-icons/bootstrap-icons.svg?raw'
import App from './app'
import type { WaveformData } from './waveform-manager.ts'
import { WaveformManager } from './waveform-manager.ts'
import { listen } from './common.ts'

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
    window.waveform = new WaveformManager(data)
  }))

listen('sx:waveform-unloading', (sessionId: string) => {
  if(window.waveform && window.waveform.sessionId == sessionId) {
    window.waveform.unload()
  }
})