import Alpine from 'alpinejs'
import type { AlpineComponent } from 'alpinejs'
import persist from '@alpinejs/persist'
import '../css/styles.css'
import iconsRaw from 'bootstrap-icons/bootstrap-icons.svg?raw'

var allSvg = document.getElementById('all')
if(allSvg) {
  allSvg.innerHTML = iconsRaw;
}

window.Alpine = Alpine
Alpine.plugin(persist)

class Tune {
  name: string
  startTime: Time
  endTime: Time
  isCurrent: boolean
  sections: Section[]

  constructor(name: string, startTime: Time, endTime: Time, isCurrent: boolean, sections: Section[]) {
    this.name = name
    this.startTime = startTime
    this.endTime = endTime
    this.isCurrent = isCurrent
    this.sections = sections
  }
}

class Section {
  name: string
  startTime: Time
  endTime: Time
  isCurrent: boolean

  constructor(name: string, startTime: Time, endTime: Time, isCurrent: boolean) {
    this.name = name
    this.startTime = startTime
    this.endTime = endTime
    this.isCurrent = isCurrent
  }
}

class Percentage {
  value: number = 0
  text: string

  constructor(text: string) {
    this.text = text
  }

  inc() {
    var speed = parseInt(this.text.replaceAll('%', ''))
    if(isNaN(speed) || speed <= 0) {
      speed = 100
    } else {
      var inc = 5 - (speed % 5)
      speed = Math.min(200, speed + inc)
    }
    this.text = speed + '%'
  }

  dec() {
    var speed = parseInt(this.text.replaceAll('%', ''))
    if(isNaN(speed) || speed <= 0) {
      speed = 100
    } else {
      var dec = speed % 5
      if(dec == 0) {
        dec = 5
      }
      speed = Math.max(1, speed - dec)
    }
    this.text = speed + '%'
  }

  normalize() {
    var speed = parseInt(this.text.replaceAll('%', ''))
    if(isNaN(speed) || speed <= 0) {
      speed = 100
    }
    this.text = speed + '%'
  }
}

class Time {
  value: number = 0
  text: string

  constructor(text: string) {
    this.text = text
  }

  inc() {
    var parts = /([0-9]{1,2}):([0-5][0-9]):([0-5][0-9]).([0-9]{3})/.exec(this.text)
    if(!parts || parts.length < 4) {
      return
    }

    var hours = parseInt(parts[1])
    var mins = parseInt(parts[2])
    var secs = parseInt(parts[3])
    var ms = parseInt(parts[4])

    if(hours == 99 && mins == 59 && secs == 59 && ms == 999) {
      return
    }

    ms += 100
    if(ms > 999) {
      secs += 1
      ms -= 1000
    }
    if(secs > 59) {
      mins += 1
      secs -= 60
    }
    if(mins > 59) {
      hours += 1
      mins -= 60
    }

    this.text = ('' + hours)
      + ':' + ('' + mins).padStart(2, '0') 
      + ':' + ('' + secs).padStart(2, '0')
      + '.' + ('' + ms).padStart(3, '0')
  }

  dec() {
    var parts = /([0-9]{1,2}):([0-5][0-9]):([0-5][0-9]).([0-9]{3})/.exec(this.text)
    if(!parts || parts.length < 4) {
      return
    }

    var hours = parseInt(parts[1])
    var mins = parseInt(parts[2])
    var secs = parseInt(parts[3])
    var ms = parseInt(parts[4])

    if(hours == 0 && mins == 0 && secs == 0 && ms == 0) {
      return
    }

    ms -= 100
    if(ms < 0) {
      secs -= 1
      ms += 1000
    }
    if(secs < 0) {
      mins -= 1
      secs += 60
    }
    if(mins < 0) {
      hours -= 1
      mins += 60
    }

    this.text = ('' + hours)
      + ':' + ('' + mins).padStart(2, '0') 
      + ':' + ('' + secs).padStart(2, '0')
      + '.' + ('' + ms).padStart(3, '0')
  }

  normalize() {
    var parts = /^(?:([0-9]{1,2})\:)?([0-5]?[0-9])\:([0-5]?[0-9])(?:\.([0-9]{1,3}))?$/.exec(this.text)
    if(!parts || parts.length < 4) {
      return
    }

    var hours = parseInt(parts[1] || '0')
    var mins = parseInt(parts[2] || '0')
    var secs = parseInt(parts[3] || '0')
    var ms = parseInt(parts[4] || '0')

    this.text = ('' + hours)
      + ':' + ('' + mins).padStart(2, '0') 
      + ':' + ('' + secs).padStart(2, '0')
      + '.' + ('' + ms).padStart(3, '0')
  }
}

export const defineComponent = <P, T>(fn: (params: P) => AlpineComponent<T>) => fn

type mode = 'full' | 'tune' | 'section'
interface App {
  mode: mode
  playing: boolean
  looping: boolean
  playbackSpeed: Percentage
  tunes: Tune[]
  init: () => void
  setMode: (mode: mode) => void
  togglePlay: () => void
  toggleLoop: () => void
}

document.addEventListener('alpine:init', () => {
  Alpine.data('app', defineComponent<unknown, App>(() => ({
    mode: 'tune',
    playing: false,
    looping: false,
    playbackSpeed: new Percentage('100%'),
    tunes: [
      new Tune('Tune 1', new Time('0:00:10.000'), new Time('0:03:00.000'), false, [
        new Section('Section A', new Time('0:00:10.000'), new Time('0:00:20.000'), false),
        new Section('Section B', new Time('0:00:20.000'), new Time('0:00:30.000'), false),
        new Section('Section C', new Time('0:00:30.000'), new Time('0:00:40.000'), false)
      ]),
      new Tune('Tune 2', new Time('0:03:00.000'), new Time('0:06:00.000'), true, [
        new Section('Section A', new Time('0:03:00.000'), new Time('0:03:10.000'), false),
        new Section('Section B', new Time('0:03:10.000'), new Time('0:03:20.000'), true),
        new Section('Section C', new Time('0:03:20.000'), new Time('0:03:30.000'), false)
      ]),
      new Tune('Tune 3', new Time('0:06:00.000'), new Time('0:09:00.000'), false, [
        new Section('Section A', new Time('0:06:00.000'), new Time('0:06:10.000'), false),
        new Section('Section B', new Time('0:06:10.000'), new Time('0:06:20.000'), false),
        new Section('Section C', new Time('0:06:20.000'), new Time('0:06:30.000'), false)
      ])
    ],
    init() {
    },
    setMode(mode: mode) {
      this.mode = mode
    },
    togglePlay() {
      this.playing = !this.playing
    },
    toggleLoop() {
      this.looping = !this.looping
    },    
  })))
})

Alpine.start()