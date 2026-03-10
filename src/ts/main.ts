import Alpine from 'alpinejs'
import persist from '@alpinejs/persist'
import '../scss/styles.scss'
import iconsRaw from 'bootstrap-icons/bootstrap-icons.svg?raw'
import Session from './session'
import Waveform from './waveform'

var allSvg = document.getElementById('all')
if(allSvg) {
  allSvg.innerHTML = iconsRaw;
}

window.Alpine = Alpine
Alpine.plugin(persist)

class Sessions {
  all: Session[]
  init() {
  }

  constructor(all: Session[]) {
    this.all = all
  }

}
Alpine.store('sessions', new Sessions([
  new Session('session-1', 'session1.mp3'), 
  new Session('session-2', 'example.mp3')
]))
Alpine.start()

let sessions = Alpine.store('sessions') as Sessions
for(var i = 0; i < sessions.all.length; i++) {
  new Waveform(sessions.all[i])
}
