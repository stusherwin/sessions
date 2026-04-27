import EventEmitter from './event-emitter'
import { Tune } from './tune'
import type { TunePerformanceData } from './tune'
import { App } from './app'

export type SessionEvents = {
  'load': []
  'unload': []
  'play-from-start': []
  'skip-to-start': []
  'skip-to-end': []
  'skip-backward': []
  'skip-forward': []
  'play-pause': []
  'zoom-in': []
  'zoom-out': []
  'editing-start': []
  'editing-stop': []
  'tune-name-updated': [string, string]
}

var delta = 5;

export interface SessionData {
  id: string,
  name: string,
  filename: string,
  peaks: number[][] | undefined,
  duration: number | undefined,
  tunes: TunePerformanceData[]
}

export class Session extends EventEmitter<SessionEvents> {
  createTune: (sessionId: string, startTime: number, endTime: number) => Tune
  id: string
  name: string
  filename: string
  tunes: TunePerformance[] = []
  peaks: number[][] | undefined
  duration: number | undefined
  loading: number = 0
  ready: boolean = false
  playing: boolean = false
  editing: boolean = false

  constructor(data: SessionData, createTune: (sessionId: string, startTime: number, endTime: number) => Tune) {
    super()
    this.createTune = createTune
    this.id = data.id
    this.name = data.name
    this.filename = data.filename
    this.peaks = data.peaks
    this.duration = data.duration
    this.tunes = data.tunes.map(t => new TunePerformance(t.id, t.tuneId, t.tuneName, t.startTime, t.endTime))
    console.log(data.tunes)
    console.log(this.tunes)

    for(var i = 1; i < this.tunes.length; i++) {
      let prevTune = this.tunes[i - 1]
      let tune = this.tunes[i]

      var locked = prevTune.endTime == tune.startTime
      prevTune.nextNeighbour = new TunePerformanceNeighbour(tune, locked)
      tune.prevNeighbour = new TunePerformanceNeighbour(prevTune, locked)
    }
  }

  load() {
    console.log('load: ' + this.id)
    this.loading = 0
    this.ready = false
    this.emit('load')
  }

  unload() {
    console.log('unload: ' + this.id)
    this.emit('unload')
  }  

  create(startTime: number, endTime: number) {
    var t = this.createTune(this.id, startTime, endTime)
    var p = t.performances[0]
    var newTune =  new TunePerformance(p.id, t.id, t.name, p.startTime, p.endTime)

    if(!this.tunes.length) {
      this.tunes = [newTune]
      return newTune;
    }

    for(var i = 0; i < this.tunes.length; i++) {
      let tune = this.tunes[i]
      if(newTune.startTime < tune.startTime && tune.endTime < newTune.endTime) {
        return null;
      }
    }

    var newAll = []
    var pushed = false
    for(var i = 0; i < this.tunes.length; i++) {
      let tune = this.tunes[i]

      //       [ A ]       [ B ]
      // <-1->
      if(!pushed && newTune.startTime < tune.startTime && newTune.endTime < tune.startTime) {
        var prevNeighbour = tune.prevNeighbour
        if(prevNeighbour) {
          prevNeighbour.tune.nextNeighbour = new TunePerformanceNeighbour(newTune, prevNeighbour.locked)
        }
        newTune.prevNeighbour = prevNeighbour
        newTune.nextNeighbour = new TunePerformanceNeighbour(tune, false)
        newAll.push(newTune)
        pushed = true
        tune.prevNeighbour = new TunePerformanceNeighbour(newTune, false)
      //       [ A ]       [ B ]
      //     <-2->
      } else if(!pushed && newTune.startTime < tune.startTime && tune.startTime < newTune.endTime && newTune.endTime < tune.endTime) {
        var prevNeighbour = tune.prevNeighbour
        if(prevNeighbour) {
          prevNeighbour.tune.nextNeighbour = new TunePerformanceNeighbour(newTune, prevNeighbour.locked)
        }
        newTune.endTime = tune.startTime
        newTune.prevNeighbour = prevNeighbour
        newTune.nextNeighbour = new TunePerformanceNeighbour(tune, true)
        newAll.push(newTune)
        pushed = true
        tune.prevNeighbour = new TunePerformanceNeighbour(newTune, true)
      }

      newAll.push(tune)

      //       [ A ]       [ B ]
      //         <-3->
      if(!pushed && tune.startTime < newTune.startTime && newTune.startTime < tune.endTime && tune.endTime < newTune.endTime) {
        var nextNeighbour = tune.nextNeighbour
        if(nextNeighbour) {
          nextNeighbour.tune.prevNeighbour = new TunePerformanceNeighbour(newTune, nextNeighbour.locked)
        }
        newTune.startTime = tune.endTime
        newTune.prevNeighbour = new TunePerformanceNeighbour(tune, true)
        newTune.nextNeighbour = nextNeighbour
        tune.nextNeighbour = new TunePerformanceNeighbour(newTune, true)
        newAll.push(newTune)
        pushed = true
      //       [ A ]       [ B ]
      //             <-4->
      } else if(!pushed && tune.endTime < newTune.startTime && i == this.tunes.length - 1) {
        newTune.prevNeighbour = new TunePerformanceNeighbour(tune, false)
        newTune.nextNeighbour = tune.nextNeighbour
        tune.nextNeighbour = new TunePerformanceNeighbour(newTune, false)
        newAll.push(newTune)
        pushed = true
      }
    }

    this.tunes = newAll

    return newTune
  }

  find(id: string) : TunePerformance | undefined {
    return this.tunes.find(s => s.id == id)
  }

  findNext(time: number) : TunePerformance | undefined {
    for(var i = 0; i < this.tunes.length; i++) {
      var tune = this.tunes[i]
      if(tune.startTime > time) {
        return tune
      }
    }
  }

  findPrevious(time: number) : TunePerformance | undefined {
    for(var i = this.tunes.length - 1; i >= 0; i--) {
      var tune = this.tunes[i]
      if(tune.startTime < time - delta) {
        return tune
      }
    }
  }

  in(id: string) {
    for(var i = 0; i < this.tunes.length; i++) {
      let tune = this.tunes[i]
      tune.current = tune.id === id
    }
  }

  out(id: string) {
    for(var i = 0; i < this.tunes.length; i++) {
      let tune = this.tunes[i]
      if(tune.id === id) {
        tune.current = false
      }
    }
  }

  playFromStart() {
    this.emit('play-from-start')
  }

  skipToStart() {
    this.emit('skip-to-start')
  }

  skipToEnd() {
    this.emit('skip-to-end')
  }

  skipBackward() {
    this.emit('skip-backward')
  }

  skipForward() {
    this.emit('skip-forward')
  }

  playPause() {
    this.emit('play-pause')
  }

  zoomIn() {
    this.emit('zoom-in')
  }

  zoomOut() {
    this.emit('zoom-out')
  }

  toggleEditing() {
    this.editing = !this.editing
    if(this.editing) {
        this.emit('editing-start')
    } else {
        this.emit('editing-stop')
    }
  }

  updateTuneName(id: string, name: string) {
    this.emit('tune-name-updated', id, name)
  }

  export() : SessionData {
    return {
      id: this.id,
      name: this.name,
      filename: this.filename,
      peaks: this.peaks,
      duration: this.duration,
      tunes: this.tunes.map(t => ({
        id: t.id,
        sessionId: this.id,
        sessionName: this.name,
        tuneId: t.tuneId,
        tuneName: t.tuneName,
        startTime: t.startTime,
        endTime: t.endTime,
        prevNeighbourLocked: t.prevNeighbour && t.prevNeighbour.locked || false,
        nextNeighbourLocked: t.nextNeighbour && t.nextNeighbour.locked || false,
      }))
    }
  }
}

class TunePerformanceNeighbour {
  tune: TunePerformance
  locked: boolean

  constructor(tune: TunePerformance, locked: boolean) {
    this.tune = tune
    this.locked = locked
  }
}

export class TunePerformance {
  id: string
  tuneId: string
  tuneName: string
  startTime: number
  endTime: number
  current: boolean = false
  prevNeighbour: TunePerformanceNeighbour | undefined = undefined
  nextNeighbour: TunePerformanceNeighbour | undefined = undefined

  constructor(id: string, tuneId: string, tuneName: string, startTime: number, endTime: number) {
    this.id = id
    this.tuneId = tuneId
    this.tuneName = tuneName
    this.startTime = startTime
    this.endTime = endTime
  }

  update(startTime: number, endTime: number) {
    if(this.prevNeighbour) {
      if(this.prevNeighbour.locked) {
        this.prevNeighbour.tune.endTime = startTime
      } else {
        if(startTime < this.prevNeighbour.tune.endTime) {
          startTime = this.prevNeighbour.tune.endTime
        }
      }
    }

    if(this.nextNeighbour) {
      if(this.nextNeighbour.locked) {
        this.nextNeighbour.tune.startTime = endTime
      } else {
        if(this.nextNeighbour.tune.startTime < endTime) {
          endTime = this.nextNeighbour.tune.startTime
        }
      }
    }

    this.startTime = startTime
    this.endTime = endTime
  }

  lockNeighbours() {
    if(this.prevNeighbour && this.startTime == this.prevNeighbour.tune.endTime) {
      this.prevNeighbour.locked = true;
      this.prevNeighbour.tune.nextNeighbour = new TunePerformanceNeighbour(this, true);
    }

    if(this.nextNeighbour && this.endTime == this.nextNeighbour.tune.startTime) {
      this.nextNeighbour.locked = true;
      this.nextNeighbour.tune.prevNeighbour = new TunePerformanceNeighbour(this, true);
    }
  }
}

export default Session