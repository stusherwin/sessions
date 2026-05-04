import EventEmitter from './event-emitter.ts'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import type { Region } from 'wavesurfer.js/dist/plugins/regions.esm.js'
import type { Performance } from './data.ts'
import { PerformanceRegionCollection } from './performance-region-collection.ts'
import type { PerformanceRegion } from './performance-region-collection.ts'
import { log } from './common.ts'

var delta = 5;

export class RegionManager extends EventEmitter<RegionManagerEvents> {
  private regions: RegionsPlugin
  private performances: PerformanceRegionCollection
  private editing: boolean = false
  private creating: boolean = false
  private subscriptions: (() => void)[] = []
  private disableDragSelection : (() => void) | undefined = undefined

  constructor(performances: Performance[], regions: RegionsPlugin) {
    super()
 
    this.regions = regions
    this.performances = new PerformanceRegionCollection(performances)
  }

  init() { log(arguments)()
    for(var performance of this.performances) {
      var region = this.regions.addRegion({ 
        id: performance.id, 
        content: performance.tuneName, 
        start: performance.startTime, 
        end: performance.endTime, 
        drag: false, 
        resize: false 
      })
      region.element?.part.add('sx-tune')
      if(performance.prevNeighbour && performance.prevNeighbour.locked) {
        region.element?.part.add('sx-locked-left')
      }
      if(performance.nextNeighbour && performance.nextNeighbour.locked) {
        region.element?.part.add('sx-locked-right')
      }
    }
    
    const subscribe = (unsubscribe: () => void) => this.subscriptions.push(unsubscribe)

    subscribe(this.regions.on('region-initialized', this.onRegionInitialized.bind(this)))
    subscribe(this.regions.on('region-created', this.onRegionCreated.bind(this)))
    subscribe(this.regions.on('region-update', this.onRegionUpdate.bind(this)))
    subscribe(this.regions.on('region-updated', this.onRegionUpdated.bind(this)))
    subscribe(this.regions.on('region-in', this.onRegionIn.bind(this)))
    subscribe(this.regions.on('region-out', this.onRegionOut.bind(this)))
  }

  unload() { log(arguments)()
    for(var unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions = [];
  }

  findRegion(regionId: string) : Region | undefined { log(arguments)()
    return this.regions.getRegions().find((r, _) => r.id == regionId)
  }

  findNext(time: number) : PerformanceRegion | undefined { log(arguments)()
    for(var performance of this.performances) {
      if(performance.startTime > time) {
        return performance
      }
    }
  }

  findPrevious(time: number) : PerformanceRegion | undefined { log(arguments)()
    for(var performance of this.performances.reversed()) {
      if(performance.startTime < time - delta) {
        return performance
      }
    }
  }
  
  create(perf: Performance) { log(arguments)()
    var region = this.findRegion("creating")

    if(!region) {
      this.creating = false
      this.disableDragSelection = this.regions.enableDragSelection({
        // color: 'rgba(206.6, 226, 254.6, 0.5)',
        drag: false
      })
      return
    }

    var performance = this.performances.add(perf)

    region.setOptions({ id : perf.id, content: perf.tuneName, start: perf.startTime, end: perf.endTime })
    var el = region.element
    if(el) {
      el.part.add('sx-tune')
      el.part.add('sx-editable')
      for(var j = 0; j < el.children.length; j++) {
        el.children[j].part.add('sx-editable')
      }
    }

    this.updateLockedState(region, performance)
    this.emit('region-created', region.start, region.end)

    this.creating = false
    this.disableDragSelection = this.regions.enableDragSelection({
      // color: 'rgba(206.6, 226, 254.6, 0.5)',
      drag: false
    })
  }

  update(performance: Performance) { log(arguments)()
    let region = this.findRegion(performance.id)
    let p = this.performances.find(performance.id)

    if(!region || !p) {
      return
    }

    region.setOptions({ id : performance.id, content: performance.tuneName })
    var el = region.element
    el?.part.add('sx-tune')
    if(this.editing) {
      el?.part.add('sx-editable')
    }
    if(p.current) {
      el?.part.add('sx-current')
    }
    if(p.prevNeighbour && p.prevNeighbour.locked) {
      el?.part.add('sx-locked-left')
    }
    if(p.nextNeighbour && p.nextNeighbour.locked) {
      el?.part.add('sx-locked-right')
    }
    p.update(performance.tuneId, performance.tuneName, performance.startTime, performance.endTime)
  }

  delete(performance: Performance) { log(arguments)()
    let region = this.findRegion(performance.id)
    let p = this.performances.find(performance.id)

    if(!region || !p) {
      return
    }

    var prevNeighbour = p.prevNeighbour;
    var nextNeighbour = p.nextNeighbour;

    region.remove()
    this.performances.delete(performance.id)

    if(prevNeighbour) {
      let prevRegion = this.findRegion(prevNeighbour.performance.id)

      this.updateLockedState(prevRegion, prevNeighbour.performance)
    }

    if(nextNeighbour) {
      let nextRegion = this.findRegion(nextNeighbour.performance.id)

      this.updateLockedState(nextRegion, nextNeighbour.performance)
    }
  }

  startEditing() { log(arguments)()
    this.editing = true
    
    this.disableDragSelection = this.regions.enableDragSelection({
      // color: 'rgba(206.6, 226, 254.6, 0.5)',
      drag: false
    })

    var rs = this.regions.getRegions()
    for(var i = 0; i < rs.length; i++) {
      rs[i].setOptions({resize: true})
      var el = rs[i].element
      if(el) {
        el.part.add('sx-editable')
        for(var j = 0; j < el.children.length; j++) {
          el.children[j].part.add('sx-editable')
        }
      }
    }
  }

  stopEditing() { log(arguments)()
    var rs = this.regions.getRegions()
    for(var i = 0; i < rs.length; i++) {
      rs[i].setOptions({resize: false})
      var el = rs[i].element
      if(el) {
        el.part.remove('sx-editable')
        for(var j = 0; j < el.children.length; j++) {
          el.children[j].part.remove('sx-editable')
        }
      }
    }

    if(this.disableDragSelection) {
      this.disableDragSelection()
      this.disableDragSelection = undefined
    }

    this.editing = false
  }

  private onRegionInitialized(region: Region) { log(arguments)()
    // different colour for creating tune
    region.setOptions({ id : 'creating' })
    this.creating = true

    var el = region.element
    if(el) {
      el.part.add('sx-editable')
      for(var child of el.children) {
        child.part.add('sx-editable')
      }
    }
  }

  private onRegionCreated(region: Region) { log(arguments)()
    if(this.disableDragSelection) {
      this.disableDragSelection()
    }

    var performance = this.performances.tryCreate(region.start, region.end)
    if(!performance) {
      region.remove()
      this.creating = false
      this.disableDragSelection = this.regions.enableDragSelection({
        // color: 'rgba(206.6, 226, 254.6, 0.5)',
        drag: false
      })
      return
    }

    this.emit('region-creating', performance.startTime, performance.endTime)
  }

  private onRegionUpdate(region: Region) { log(arguments)()
    let performance = this.performances.find(region.id);

    if(!performance) {
      return
    }

    performance.update(performance.tuneId, performance.tuneName, region.start, region.end)
    region.setOptions({ start: performance.startTime, end: performance.endTime })

    this.updateLockedState(region, performance)

    if(performance.prevNeighbour) {
      var prevRegion = this.findRegion(performance.prevNeighbour.performance.id)
      prevRegion?.setOptions({ start: performance.prevNeighbour.performance.startTime, end: performance.prevNeighbour.performance.endTime })
      this.updateLockedState(prevRegion, performance.prevNeighbour?.performance)
    }

    if(performance.nextNeighbour) {
      var nextRegion = this.findRegion(performance.nextNeighbour.performance.id)
      nextRegion?.setOptions({ start: performance.nextNeighbour.performance.startTime, end: performance.nextNeighbour.performance.endTime })
      this.updateLockedState(nextRegion, performance.nextNeighbour?.performance)
    }
  }

  private onRegionUpdated(region: Region) { log(arguments)()
    let performance = this.performances.find(region.id);

    if(!performance) {
      return
    }

    performance.lockNeighbours()
    this.updateLockedState(region, performance)
    this.emit('region-updating', performance.id, performance.startTime, performance.endTime)

    if(performance.prevNeighbour) {
      var prevRegion = this.findRegion(performance.prevNeighbour.performance.id)
      this.updateLockedState(prevRegion, performance.prevNeighbour?.performance)
      this.emit('region-updating', performance.prevNeighbour.performance.id, performance.prevNeighbour.performance.startTime, performance.prevNeighbour.performance.endTime)
    }

    if(performance.nextNeighbour) {
      var nextRegion = this.findRegion(performance.nextNeighbour.performance.id)
      this.updateLockedState(nextRegion, performance.nextNeighbour?.performance)
      this.emit('region-updating', performance.nextNeighbour.performance.id, performance.nextNeighbour.performance.startTime, performance.nextNeighbour.performance.endTime)
    }
  }

  private updateLockedState(region : Region | undefined, performance: PerformanceRegion) { log(arguments)()
    var el = region?.element
    if(el) {
      el.part.add('sx-tune')
      if(this.editing) {
        el.part.add('sx-editable')
        for(var j = 0; j < el.children.length; j++) {
          el.children[j].part.add('sx-editable')
        }
      }
      if(performance.current) {
        el.part.add('sx-current')
      } else {
        el.part.remove('sx-current')
      }
    }

    function lock(region: Region | undefined, side: string) { log(arguments)()
      region?.element?.part.add('sx-locked-' + side)
      var handle = region?.element?.querySelector('::part(region-handle-' + side + ')')
      handle?.part.add('sx-locked')
    }

    function unlock(region: Region | undefined, side: string) { log(arguments)()
      region?.element?.part.remove('sx-locked-' + side)
      var handle = region?.element?.querySelector('::part(region-handle-' + side + ')')
      handle?.part.remove('sx-locked')
    }

    if(performance.prevNeighbour) {
      performance.prevNeighbour.locked ? lock(region, 'left') : unlock(region, 'left')
      var prev = this.findRegion(performance.prevNeighbour.performance.id)
      performance.prevNeighbour.locked ? lock(prev, 'right') : unlock(prev, 'right')
    } else {
      unlock(region, 'left')
    }

    if(performance.nextNeighbour) {
      performance.nextNeighbour.locked ? lock(region, 'right') : unlock(region, 'right')
      var next = this.findRegion(performance.nextNeighbour.performance.id)
      performance.nextNeighbour.locked ? lock(next, 'left') : unlock(next, 'left')
    } else {
      unlock(region, 'right')
    }
  }
  
  private onRegionIn(region: Region) { log(arguments)()
    var oldCurrent = this.performances.getCurrent()
    this.performances.in(region.id)
    var current = this.performances.getCurrent()
    if(oldCurrent?.id !== current?.id) {
      this.emit('current-region-changed', current?.id)
    }

    for(var performance of this.performances) {
      var r = this.findRegion(performance.id)
      if(performance.current) {
        r?.element?.part.add('sx-current')
      } else {
        r?.element?.part.remove('sx-current')
      }
    }
  }

  private onRegionOut(region: Region) { log(arguments)()
    var oldCurrent = this.performances.getCurrent()
    this.performances.out(region.id)
    var current = this.performances.getCurrent()
    if(oldCurrent?.id !== current?.id) {
      this.emit('current-region-changed', current?.id)
    }

    for(var performance of this.performances) {
      var r = this.findRegion(performance.id)
      if(performance.current) {
        r?.element?.part.add('sx-current')
      } else {
        r?.element?.part.remove('sx-current')
      }
    }
  }
}

type RegionManagerEvents = {
  'region-creating': [number, number]
  'region-created': [number, number]
  'region-updating': [string, number, number]
  'region-updated': [string, number, number]
  'current-region-changed': [string | undefined]
}
