import Alpine from 'alpinejs'
import persist from '@alpinejs/persist'
import '../scss/styles.scss'
import iconsRaw from 'bootstrap-icons/bootstrap-icons.svg?raw'
import { App } from './app'
import Waveform from './waveform'

var allSvg = document.getElementById('all')
if(allSvg) {
  allSvg.innerHTML = iconsRaw;
}

window.Alpine = Alpine
Alpine.plugin(persist)

const myRequest = new Request("/sessions.json");

declare global {
    // Note the capital "W"
    interface Window { 
      app: App;
      formatTime: (seconds: number) => string     
    }
}

window.formatTime = (seconds: number) => {
  console.log(seconds)
  let hrs = Math.floor(seconds / (60*60))
  var remaining = seconds - (hrs * 60 * 60)
  let mins = Math.floor(remaining / 60)
  var remaining = remaining - (mins * 60)
  let secs = Math.round(remaining)

  return (hrs > 0 ? `${hrs}h` : '') + ' ' +
    (mins > 0 ? `${mins}m` : '') + ' ' +
    `${secs}s`
}

window
.fetch(myRequest)
.then((response) => {
    if(!response.ok) { 
        throw new Error('JSON peaks file not found');
    }
    return response.json() 
})
.then((data) => {
    console.log(data)
    Alpine.store('app', new App(data))
})
.catch(err => {
    console.error(err)
    Alpine.store('app', new App({sessions: [], tunes: []}))
})
.finally(() => {

  let app = Alpine.store('app') as App
  Alpine.start()
  for(const session of Object.values(app.sessions)) {
    new Waveform(session)
  }

  window.app = app
})