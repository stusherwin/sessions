import EventEmitter from './event-emitter'

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
  tunes: TuneData[]
}

export interface TuneData {
  id: string
  name: string
  startTime: number
  endTime: number,
  prevNeighbourLocked: boolean
  nextNeighbourLocked: boolean
}

export class Session extends EventEmitter<SessionEvents> {
  id: string
  name: string
  filename: string
  tunes: Tune[] = []
  peaks: number[][] | undefined
  duration: number | undefined
  nextTuneId: number = 1
  loading: number = 0
  ready: boolean = false
  playing: boolean = false
  editing: boolean = false

  constructor(data: SessionData) {
    super()
    this.id = data.id
    this.name = data.name
    this.filename = data.filename
    this.peaks = data.peaks
    this.duration = data.duration
    this.tunes = data.tunes.map(t => new Tune(t.id, t.name, t.startTime, t.endTime))
    console.log(data.tunes)
    console.log(this.tunes)

    for(var i = 1; i < this.tunes.length; i++) {
      let prevTune = this.tunes[i - 1]
      let tune = this.tunes[i]
      let tuneData = data.tunes[i]

      prevTune.nextNeighbour = new TuneNeighbour(tune, tuneData && tuneData.prevNeighbourLocked)
      tune.prevNeighbour = new TuneNeighbour(prevTune, tuneData && tuneData.prevNeighbourLocked)
    }

    this.nextTuneId = this.tunes.length + 1
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
    var newTune = new Tune('tune-' + this.nextTuneId, 'Tune ' + this.nextTuneId, startTime, endTime)

    if(!this.tunes.length) {
      this.tunes = [newTune]
      this.nextTuneId++
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
          prevNeighbour.tune.nextNeighbour = new TuneNeighbour(newTune, prevNeighbour.locked)
        }
        newTune.prevNeighbour = prevNeighbour
        newTune.nextNeighbour = new TuneNeighbour(tune, false)
        newAll.push(newTune)
        pushed = true
        tune.prevNeighbour = new TuneNeighbour(newTune, false)
      //       [ A ]       [ B ]
      //     <-2->
      } else if(!pushed && newTune.startTime < tune.startTime && tune.startTime < newTune.endTime && newTune.endTime < tune.endTime) {
        var prevNeighbour = tune.prevNeighbour
        if(prevNeighbour) {
          prevNeighbour.tune.nextNeighbour = new TuneNeighbour(newTune, prevNeighbour.locked)
        }
        newTune.endTime = tune.startTime
        newTune.prevNeighbour = prevNeighbour
        newTune.nextNeighbour = new TuneNeighbour(tune, true)
        newAll.push(newTune)
        pushed = true
        tune.prevNeighbour = new TuneNeighbour(newTune, true)
      }

      newAll.push(tune)

      //       [ A ]       [ B ]
      //         <-3->
      if(!pushed && tune.startTime < newTune.startTime && newTune.startTime < tune.endTime && tune.endTime < newTune.endTime) {
        var nextNeighbour = tune.nextNeighbour
        if(nextNeighbour) {
          nextNeighbour.tune.prevNeighbour = new TuneNeighbour(newTune, nextNeighbour.locked)
        }
        newTune.startTime = tune.endTime
        newTune.prevNeighbour = new TuneNeighbour(tune, true)
        newTune.nextNeighbour = nextNeighbour
        tune.nextNeighbour = new TuneNeighbour(newTune, true)
        newAll.push(newTune)
        pushed = true
      //       [ A ]       [ B ]
      //             <-4->
      } else if(!pushed && tune.endTime < newTune.startTime && i == this.tunes.length - 1) {
        newTune.prevNeighbour = new TuneNeighbour(tune, false)
        newTune.nextNeighbour = tune.nextNeighbour
        tune.nextNeighbour = new TuneNeighbour(newTune, false)
        newAll.push(newTune)
        pushed = true
      }
    }

    this.tunes = newAll
    this.nextTuneId++

    return newTune
  }

  find(id: string) : Tune | undefined {
    return this.tunes.find(s => s.id == id)
  }

  findNext(time: number) : Tune | undefined {
    for(var i = 0; i < this.tunes.length; i++) {
      var tune = this.tunes[i]
      if(tune.startTime > time) {
        return tune
      }
    }
  }

  findPrevious(time: number) : Tune | undefined {
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
        name: t.name,
        startTime: t.startTime,
        endTime: t.endTime,
        prevNeighbourLocked: t.prevNeighbour && t.prevNeighbour.locked || false,
        nextNeighbourLocked: t.nextNeighbour && t.nextNeighbour.locked || false,
      }))
    }
  }
}

class TuneNeighbour {
  tune: Tune
  locked: boolean

  constructor(tune: Tune, locked: boolean) {
    this.tune = tune
    this.locked = locked
  }
}

export class Tune {
  id: string
  name: string
  startTime: number
  endTime: number
  current: boolean = false
  prevNeighbour: TuneNeighbour | undefined = undefined
  nextNeighbour: TuneNeighbour | undefined = undefined

  constructor(id: string, name: string, startTime: number, endTime: number) {
    this.id = id
    this.name = name
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
      this.prevNeighbour.tune.nextNeighbour = new TuneNeighbour(this, true);
    }

    if(this.nextNeighbour && this.endTime == this.nextNeighbour.tune.startTime) {
      this.nextNeighbour.locked = true;
      this.nextNeighbour.tune.prevNeighbour = new TuneNeighbour(this, true);
    }
  }
}

export default Session