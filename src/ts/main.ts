import Alpine from 'alpinejs'
import persist from '@alpinejs/persist'
import '../scss/styles.scss'
import iconsRaw from 'bootstrap-icons/bootstrap-icons.svg?raw'
import { Session } from './session'
import type { SessionData } from './session'
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

  constructor(sessions: SessionData[]) {
    this.all = sessions.map(s => new Session(s))
  }
}

const myRequest = new Request("/sessions.json");

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
    // var json = JSON.parse(data)
    // console.log(json)
    Alpine.store('sessions', new Sessions(data))
})
.catch(err => {
    console.error(err)
    Alpine.store('sessions', new Sessions([]))
})
.finally(() => {
  let sessions = Alpine.store('sessions') as Sessions
  Alpine.start()
  for(var i = 0; i < sessions.all.length; i++) {
    new Waveform(sessions.all[i])
  }

  window.sessions = sessions
})

declare global {
    // Note the capital "W"
    interface Window { sessions: Sessions; }
}


// var sessionData: SessionData[] = [
//   { 
//     id: 'session-1', 
//     name: 'Pub session: Blackie O\'Connell, Casey Driessen, Cyril O\'Donoghue', 
//     filename: 'session1.mp3', 
//     tunes: [], 
//     peaks: undefined,
//     duration: undefined }, 
//   { 
//     id: 'session-2', 
//     name: 'Tues session 2026-01-20', 
//     filename: 'Tues session 2026-01-20.m4a', 
//     tunes: [], 
//     peaks: undefined,
//     duration: undefined },
//   { 
//     id: 'session-3', 
//     name: 'Tues session 2026-01-20 (2)', 
//     filename: 'Tues session 2026-01-20-2.m4a', 
//     tunes: [], 
//     peaks: undefined,
//     duration: undefined },
//   { 
//     id: 'session-4', 
//     name: 'Tues session 2026-02-03', 
//     filename: 'Tues session 2026-02-03.m4a', 
//     tunes: [], 
//     peaks: undefined,
//     duration: undefined },
//   { 
//     id: 'session-5', 
//     name: 'Tues session 2026-02-17', 
//     filename: 'Tues session 2026-02-17.m4a', 
//     tunes: [], 
//     peaks: undefined,
//     duration: undefined }
// ]

