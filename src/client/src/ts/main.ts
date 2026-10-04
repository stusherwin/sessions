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

interface CurrentItem {
  isCurrent: boolean
}

class CurrentItemCollection<T extends CurrentItem> {
  items: T[]

  constructor(items: T[]) {
    this.items = items
  }

  [Symbol.iterator](): ArrayIterator<T> {
    return this.items[Symbol.iterator]()
  }

  any() {
    return !!this.items.length
  }

  findPrevious(predicate: (item: T) => boolean) {
    var i = this.items.findIndex(i => i.isCurrent)
    if(i < 0) {
      return
    }

    do { 
      i-- 
    } while(i >= 0 && !predicate(this.items[i]))
    
    if(i < 0 || !predicate(this.items[i])) {
      return
    }

    return this.items[i]
  }

  findNext(predicate: (item: T) => boolean) {
    var i = this.items.findIndex(i => i.isCurrent) 
    if(i < 0) {
      return
    }

    do { 
      i++
    } while(i <= this.items.length - 1 && !predicate(this.items[i]))
    
    if(i > this.items.length - 1 || !predicate(this.items[i])) {
      return
    }

    return this.items[i]
  }

  getCurrent() {
    return this.items.find(i => i.isCurrent)
  }

  setCurrent(item: T) {
    for(var i = 0; i < this.items.length; i++) {
      this.items[i].isCurrent = this.items[i] == item
    }

    return item
  }

  clearCurrent() {
    for(var i = 0; i < this.items.length; i++) {
      this.items[i].isCurrent = false
    }
  }

  ensureCurrent() {
    if(!this.items.length) {
      return
    }

    var current = this.items.find(i => i.isCurrent);
    if(!current) {
      this.items[0].isCurrent = true
      current = this.items[0]
    }

    return current
  }

  setFirstCurrent() {
    if(!this.items.length) {
      return
    }

    for(var i = 0; i < this.items.length; i++) {
      this.items[i].isCurrent = i == 0
    }

    return this.items[0]
  }

  setLastCurrent() {
    if(!this.items.length) {
      return
    }

    for(var i = 0; i < this.items.length; i++) {
      this.items[i].isCurrent = i == this.items.length - 1
    }

    return this.items[0]
  }

  setPreviousCurrent() {
    if(!this.items.length) {
      return
    }

    var i = this.items.findIndex(i => i.isCurrent);
    if(i > 0) {
      i = i - 1
    } else {
      i = 0
    }

    for(var item of this.items) {
      item.isCurrent = false
    }
    this.items[i].isCurrent = true
    return this.items[i]
  }

  setNextCurrent() {
    if(!this.items.length) {
      return
    }

    var i = this.items.findIndex(i => i.isCurrent);
    if(i >= 0 && i < this.items.length - 1) {
      i = i + 1
    } else {
      i = this.items.length - 1
    }

    for(var item of this.items) {
      item.isCurrent = false
    }
    this.items[i].isCurrent = true
    return this.items[i]
  }
}

class Tune implements CurrentItem {
  name: string
  startTime: Time
  endTime: Time
  isCurrent: boolean = false
  sections: CurrentItemCollection<Section>

  constructor(name: string, startTime: Time, endTime: Time, sections: Section[]) {
    this.name = name
    this.startTime = startTime
    this.endTime = endTime
    this.sections = new CurrentItemCollection<Section>(sections)
  }
}

class Section implements CurrentItem {
  name: string
  startTime: Time
  endTime: Time
  isCurrent: boolean = false

  constructor(name: string, startTime: Time, endTime: Time) {
    this.name = name
    this.startTime = startTime
    this.endTime = endTime
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
  tunes: CurrentItemCollection<Tune>
  init: () => void
  setMode: (mode: mode) => void
  togglePlay: () => void
  toggleLoop: () => void
  skipPrevious: () => void
  skipNext: () => void
  skipPreviousDisabled: () => boolean
  skipNextDisabled: () => boolean
}

document.addEventListener('alpine:init', () => {
  Alpine.data('app', defineComponent<unknown, App>(() => ({
    mode: 'full',
    playing: false,
    looping: false,
    playbackSpeed: new Percentage('100%'),
    tunes: new CurrentItemCollection<Tune>([
      new Tune('Tune 1', new Time('0:00:00.000'), new Time('0:03:00.000'), [
        new Section('Section A', new Time('0:00:00.000'), new Time('0:00:10.000')),
        new Section('Section B', new Time('0:00:10.000'), new Time('0:00:20.000')),
        new Section('Section C', new Time('0:00:20.000'), new Time('0:00:30.000'))
      ]),
      new Tune('Tune 2', new Time('0:03:00.000'), new Time('0:06:00.000'), []),
      new Tune('Tune 3', new Time('0:06:00.000'), new Time('0:09:00.000'), [
        new Section('Section A', new Time('0:06:00.000'), new Time('0:06:10.000')),
        new Section('Section B', new Time('0:06:10.000'), new Time('0:06:20.000')),
        new Section('Section C', new Time('0:06:20.000'), new Time('0:06:30.000')),
        new Section('Section D', new Time('0:06:30.000'), new Time('0:06:40.000')),
        new Section('Section E', new Time('0:06:40.000'), new Time('0:06:50.000')),
        new Section('Section F', new Time('0:06:50.000'), new Time('0:07:00.000')),
        new Section('Section G', new Time('0:07:00.000'), new Time('0:07:10.000')),
        new Section('Section H', new Time('0:07:10.000'), new Time('0:07:20.000')),
        new Section('Section I', new Time('0:07:20.000'), new Time('0:07:30.000'))
      ]),
      new Tune('Tune 4', new Time('0:09:00.000'), new Time('0:12:00.000'), []),
      new Tune('Tune 5', new Time('0:12:00.000'), new Time('0:15:00.000'), [
        new Section('Section A', new Time('0:12:00.000'), new Time('0:12:10.000')),
        new Section('Section B', new Time('0:12:10.000'), new Time('0:12:20.000')),
        new Section('Section C', new Time('0:12:20.000'), new Time('0:12:30.000'))
      ])
    ]),
    init() {
      console.log(typeof this.tunes)
      console.log(Array.isArray(this.tunes))
      for(var tune of this.tunes) {
        console.log(tune)

      }
    },
    setMode(mode: mode) {
      this.mode = mode
      if(mode == 'tune') {
        this.tunes.ensureCurrent()
      } else if(mode == 'section') {
        var tune = this.tunes.ensureCurrent()
        if(tune) {
          tune.sections.ensureCurrent()
        }
      }
    },
    togglePlay() {
      this.playing = !this.playing
    },
    toggleLoop() {
      this.looping = !this.looping
    },
    skipPrevious() {
      if(this.mode == 'tune') {
        var currentTune = this.tunes.getCurrent()
        var newCurrentTune = this.tunes.setPreviousCurrent()
        if(!newCurrentTune) {
          return
        }

        newCurrentTune.sections.setFirstCurrent()
        if(currentTune && currentTune != newCurrentTune) {
          currentTune.sections.clearCurrent()
        }
      } else if(this.mode == 'section') {
        var currentTune = this.tunes.getCurrent()
        if(!currentTune) {
          return
        }
        
        var currentSection = currentTune.sections.getCurrent()
        var newCurrentSection = currentTune.sections.setPreviousCurrent()
        if(newCurrentSection && newCurrentSection != currentSection) {
          return
        }

        var newCurrentTune = this.tunes.findPrevious(t => t.sections.any())
        if(newCurrentTune) {
          this.tunes.setCurrent(newCurrentTune)
          currentTune.sections.clearCurrent()
          newCurrentTune.sections.setLastCurrent()
        }
      }
    },
    skipNext() {
      if(this.mode == 'tune') {
        var currentTune = this.tunes.getCurrent()
        var newCurrentTune = this.tunes.setNextCurrent()
        if(!newCurrentTune) {
          return
        }

        newCurrentTune.sections.setFirstCurrent()
        if(currentTune && currentTune != newCurrentTune) {
          currentTune.sections.clearCurrent()
        }
      } else if(this.mode == 'section') {
        var currentTune = this.tunes.getCurrent()
        if(!currentTune) {
          return
        }
        
        var currentSection = currentTune.sections.getCurrent()
        var newCurrentSection = currentTune.sections.setNextCurrent()
        if(newCurrentSection && newCurrentSection != currentSection) {
          return
        }

        var newCurrentTune = this.tunes.findNext(t => t.sections.any())
        if(newCurrentTune) {
          this.tunes.setCurrent(newCurrentTune)
          currentTune.sections.clearCurrent()
          newCurrentTune.sections.setFirstCurrent()
        }
      }
    },
    skipPreviousDisabled() {
      if(this.mode == 'full') {
        return true;
      }
      return false
    },
    skipNextDisabled() {
      if(this.mode == 'full') {
        return true;
      }
      return false
    }    
  })))
})

Alpine.start()