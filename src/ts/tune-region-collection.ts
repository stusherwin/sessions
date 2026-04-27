import type { TunePerformance } from './data.ts'

export class TuneRegionCollection {
  tunes: TuneRegion[] = []

  constructor(tunes: TunePerformance[]) {
    this.tunes = tunes
      .map(t => new TuneRegion(t.tuneId, t.tuneName, t.startTime, t.endTime))
      .sort((a, b) => a.startTime - b.startTime)
    
    this.lockNeighbours()
  }

  [Symbol.iterator](): ArrayIterator<TuneRegion> {
    return this.tunes[Symbol.iterator]()
  }

  reversed() {
    var x = this.tunes
    return {
      *[Symbol.iterator]() {
        for(var i = x.length - 1; i >=0; i--) {
          yield x[i];
        }
      }
    }
  }

  find(id: string) : TuneRegion | undefined {
    return this.tunes.find(t => t.tuneId == id)
  }

  delete(id: string) {
    var tune = this.tunes.find(t => t.tuneId == id)
    if(!tune) {
      return
    }

    if(tune.prevNeighbour) {
      tune.prevNeighbour.tune.nextNeighbour = undefined
    }

    if(tune.nextNeighbour) {
      tune.nextNeighbour.tune.prevNeighbour = undefined
    }

    this.tunes = this.tunes.filter(t => t.tuneId != id)
  }

  getCurrent() : TuneRegion | undefined {
    return this.tunes.find(t => t.current)
  }

  in(id: string) {
    for(var i = 0; i < this.tunes.length; i++) {
      let tune = this.tunes[i]
      tune.current = tune.tuneId === id
    }
  }

  out(id: string) {
    for(var i = 0; i < this.tunes.length; i++) {
      let tune = this.tunes[i]
      if(tune.tuneId === id) {
        tune.current = false
      }
    }
  }

  tryCreate(startTime: number, endTime: number) : {startTime: number, endTime: number} | undefined {
    for(var tune of this.tunes) {
      if(startTime < tune.startTime && tune.endTime < endTime) {
        return;
      }
    }

    for(var tune of this.tunes) {
      //       [ A ]       [ B ]
      // <-1->
      if(startTime < tune.startTime && endTime < tune.startTime) {
        break
      }

      //       [ A ]       [ B ]
      //     <-2->      
      if(startTime < tune.startTime && tune.startTime < endTime && endTime < tune.endTime) {
        endTime = tune.startTime
        break
      }

      //       [ A ]       [ B ]
      //         <-3->
      if(tune.startTime < startTime && startTime < tune.endTime && tune.endTime < endTime) {
        startTime = tune.endTime
        break
      }
    }

    return { startTime, endTime }
  }

  add(perf: TunePerformance) : TuneRegion {
    var newTune =  new TuneRegion(perf.tuneId, perf.tuneName, perf.startTime, perf.endTime)

    if(!this.tunes.length) {
      this.tunes = [newTune]
      return newTune;
    }

    var tunes = []
    var pushed = false
    
    for(var tune of this.tunes) {
      if(!pushed && newTune.startTime < tune.startTime) {
        tunes.push(newTune)
        pushed = true
      }
      tunes.push(tune)
    }

    if(!pushed) {
      tunes.push(newTune)
    }

    this.tunes = tunes
    this.lockNeighbours()

    return newTune
  }

  lockNeighbours() {
    for(var i = 1; i < this.tunes.length; i++) {
      let prevTune = this.tunes[i - 1]
      let tune = this.tunes[i]

      var locked = prevTune.endTime == tune.startTime
      prevTune.nextNeighbour = new TuneRegionNeighbour(tune, locked)
      tune.prevNeighbour = new TuneRegionNeighbour(prevTune, locked)
    }    
  }
}

export class TuneRegion {
  tuneId: string
  tuneName: string
  startTime: number
  endTime: number
  current: boolean = false
  prevNeighbour: TuneRegionNeighbour | undefined = undefined
  nextNeighbour: TuneRegionNeighbour | undefined = undefined

  constructor(tuneId: string, tuneName: string, startTime: number, endTime: number) {
    this.tuneId = tuneId
    this.tuneName = tuneName
    this.startTime = startTime
    this.endTime = endTime
  }

  updateName(name: string) {
    this.tuneName = name
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
      this.prevNeighbour.tune.nextNeighbour = new TuneRegionNeighbour(this, true);
    }

    if(this.nextNeighbour && this.endTime == this.nextNeighbour.tune.startTime) {
      this.nextNeighbour.locked = true;
      this.nextNeighbour.tune.prevNeighbour = new TuneRegionNeighbour(this, true);
    }
  }
}

class TuneRegionNeighbour {
  tune: TuneRegion
  locked: boolean

  constructor(tune: TuneRegion, locked: boolean) {
    this.tune = tune
    this.locked = locked
  }
}