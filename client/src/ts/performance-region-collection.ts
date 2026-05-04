import type { Performance } from './data.ts'
import { log } from './common.ts'

export class PerformanceRegionCollection {
  private list: PerformanceRegion[] = []

  constructor(performances: Performance[]) {
    this.list = performances
      .map(t => new PerformanceRegion(t.id, t.tuneId, t.tuneName, t.startTime, t.endTime))
      .sort((a, b) => a.startTime - b.startTime)
    
    this.lockNeighbours()
  }

  [Symbol.iterator](): ArrayIterator<PerformanceRegion> {
    return this.list[Symbol.iterator]()
  }

  reversed() { log(arguments)()
    var x = this.list
    return {
      *[Symbol.iterator]() {
        for(var i = x.length - 1; i >=0; i--) {
          yield x[i];
        }
      }
    }
  }

  find(id: string) : PerformanceRegion | undefined { log(arguments)()
    return this.list.find(t => t.id == id)
  }

  delete(id: string) { log(arguments)()
    var performance = this.list.find(t => t.id == id)
    if(!performance) {
      return
    }

    this.list = this.list.filter(t => t.id != id)
    this.lockNeighbours()
  }

  getCurrent() : PerformanceRegion | undefined { log(arguments)()
    return this.list.find(t => t.current)
  }

  in(id: string) { log(arguments)()
    for(var i = 0; i < this.list.length; i++) {
      let performance = this.list[i]
      performance.current = performance.id === id
    }
  }

  out(id: string) { log(arguments)()
    for(var i = 0; i < this.list.length; i++) {
      let performance = this.list[i]
      if(performance.id === id) {
        performance.current = false
      }
    }
  }

  tryCreate(startTime: number, endTime: number) : {startTime: number, endTime: number} | undefined { log(arguments)()
    for(var performance of this.list) {
      if(startTime < performance.startTime && performance.endTime < endTime) {
        return;
      }
    }

    for(var performance of this.list) {
      //       [ A ]       [ B ]
      // <-1->
      if(startTime < performance.startTime && endTime < performance.startTime) {
        break
      }

      //       [ A ]       [ B ]
      //     <-2->      
      if(startTime < performance.startTime && performance.startTime < endTime && endTime < performance.endTime) {
        endTime = performance.startTime
        break
      }

      //       [ A ]       [ B ]
      //         <-3->
      if(performance.startTime < startTime && startTime < performance.endTime && performance.endTime < endTime) {
        startTime = performance.endTime
        break
      }
    }

    return { startTime, endTime }
  }

  add(perf: Performance) : PerformanceRegion { log(arguments)()
    var newPerformance =  new PerformanceRegion(perf.id, perf.tuneId, perf.tuneName, perf.startTime, perf.endTime)

    if(!this.list.length) {
      this.list = [newPerformance]
      return newPerformance;
    }

    var newList = []
    var pushed = false
    
    for(var performance of this.list) {
      if(!pushed && newPerformance.startTime < performance.startTime) {
        newList.push(newPerformance)
        pushed = true
      }
      newList.push(performance)
    }

    if(!pushed) {
      newList.push(newPerformance)
    }

    this.list = newList
    this.lockNeighbours()

    return newPerformance
  }

  private lockNeighbours() { log(arguments)()
    this.list[0].prevNeighbour = undefined

    for(var i = 1; i < this.list.length; i++) {
      let prevTune = this.list[i - 1]
      let tune = this.list[i]

      var locked = prevTune.endTime == tune.startTime
      prevTune.nextNeighbour = new PerformanceRegionNeighbour(tune, locked)
      tune.prevNeighbour = new PerformanceRegionNeighbour(prevTune, locked)
      tune.nextNeighbour = undefined
    }    
  }
}

export class PerformanceRegion {
  id: string
  tuneId: string
  tuneName: string
  startTime: number
  endTime: number
  current: boolean = false
  prevNeighbour: PerformanceRegionNeighbour | undefined = undefined
  nextNeighbour: PerformanceRegionNeighbour | undefined = undefined

  constructor(id: string, tuneId: string, tuneName: string, startTime: number, endTime: number) {
    this.id = id
    this.tuneId = tuneId
    this.tuneName = tuneName
    this.startTime = startTime
    this.endTime = endTime
  }

  update(tuneId: string, tuneName: string, startTime: number, endTime: number) { log(arguments)()
    this.tuneId = tuneId
    this.tuneName = tuneName

    if(startTime != this.startTime || endTime != this.endTime) {
      if(this.prevNeighbour) {
        if(this.prevNeighbour.locked) {
          this.prevNeighbour.performance.endTime = startTime
        } else {
          if(startTime < this.prevNeighbour.performance.endTime) {
            startTime = this.prevNeighbour.performance.endTime
          }
        }
      }

      if(this.nextNeighbour) {
        if(this.nextNeighbour.locked) {
          this.nextNeighbour.performance.startTime = endTime
        } else {
          if(this.nextNeighbour.performance.startTime < endTime) {
            endTime = this.nextNeighbour.performance.startTime
          }
        }
      }

      this.startTime = startTime
      this.endTime = endTime
    }
  }

  lockNeighbours() { log(arguments)()
    if(this.prevNeighbour && this.startTime == this.prevNeighbour.performance.endTime) {
      this.prevNeighbour.locked = true;
      this.prevNeighbour.performance.nextNeighbour = new PerformanceRegionNeighbour(this, true);
    }

    if(this.nextNeighbour && this.endTime == this.nextNeighbour.performance.startTime) {
      this.nextNeighbour.locked = true;
      this.nextNeighbour.performance.prevNeighbour = new PerformanceRegionNeighbour(this, true);
    }
  }
}

class PerformanceRegionNeighbour {
  performance: PerformanceRegion
  locked: boolean

  constructor(tune: PerformanceRegion, locked: boolean) {
    this.performance = tune
    this.locked = locked
  }
}