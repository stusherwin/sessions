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

// export default Song
// declare global {
//     // Note the capital "W"
//     interface Window { Song: any; }
// }

// window.Song = Song

class Sessions {
  all: Session[]
  init() {
  }

  constructor(all: Session[]) {
    this.all = all
  }

}
Alpine.store('sessions', new Sessions([new Session(), new Session()]))
Alpine.start()

let sessions = Alpine.store('sessions') as Sessions

new Waveform('session1.mp3', '#waveform0', sessions.all[0])
new Waveform('example.mp3', '#waveform1', sessions.all[1])