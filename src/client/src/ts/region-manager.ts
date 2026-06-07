import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import type { Region } from 'wavesurfer.js/dist/plugins/regions.esm.js'
import type { Performance } from './data.ts'
import { PerformanceRegionCollection } from './performance-region-collection.ts'
import type { PerformanceRegion } from './performance-region-collection.ts'
import { dispatch, listen, log } from './common.ts'

var delta = 5;

export class RegionManager {
  private sessionId: string
  private performances: PerformanceRegionCollection
  private initialPerformanceId: string | undefined
  private regions: RegionsPlugin
  private editing: boolean = false
  private subscriptions: (() => void)[] = []
  private disableDragSelection : (() => void) | undefined = undefined

  public initialStartAndEndTime: { startTime: number, endTime: number } | undefined = undefined 

  constructor(
    sessionId: string, 
    performances: Performance[], 
    initialPerformanceId: string | undefined, 
    regions: RegionsPlugin) { log(arguments)()
    this.sessionId = sessionId
    this.regions = regions
    this.initialPerformanceId = initialPerformanceId
    this.performances = new PerformanceRegionCollection(performances)
  }

  init() { log(arguments)()
    for(var performance of this.performances) {
      if(this.initialPerformanceId == performance.id) {
        this.initialStartAndEndTime = { startTime: performance.startTime, endTime: performance.endTime }
      }

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
    subscribe(listen('sx:performance-created', this.onAppPerformanceCreated.bind(this)))
    subscribe(listen('sx:performance-updated', this.onAppPerformanceUpdated.bind(this)))
    subscribe(listen('sx:performance-deleted', this.onAppPerformanceDeleted.bind(this)))
    subscribe(listen('sx:editing-start', this.onAppEditingStart.bind(this)))
    subscribe(listen('sx:editing-stop', this.onAppEditingStop.bind(this)))
  }

  unload() { log(arguments)()
    for(var unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions = [];
  }

  getNextStartAndEndTime(time: number) : { startTime: number, endTime: number } | undefined { log(arguments)()
    for(var performance of this.performances) {
      if(performance.startTime > time) {
        return { startTime: performance.startTime, endTime: performance.endTime }
      }
    }
  }

  getPreviousStartAndEndTime(time: number) : { startTime: number, endTime: number } | undefined { log(arguments)()
    for(var performance of this.performances.reversed()) {
      if(performance.startTime < time - delta) {
        return { startTime: performance.startTime, endTime: performance.endTime }
      }
    }
  }
      
  private onAppPerformanceCreated(performance: Performance) { log(arguments)()
    if(performance.sessionId != this.sessionId) {
      return
    }

    var region = this.findRegion("creating")

    if(!region) {
      this.disableDragSelection = this.regions.enableDragSelection({
        // color: 'rgba(206.6, 226, 254.6, 0.5)',
        drag: false
      })
      return
    }

    var p = this.performances.add(performance)

    region.setOptions({ id : performance.id, content: performance.tuneName, start: performance.startTime, end: performance.endTime })
    var el = region.element
    if(el) {
      el.part.add('sx-tune')
      el.part.add('sx-editable')
      for(var j = 0; j < el.children.length; j++) {
        el.children[j].part.add('sx-editable')
        el.children[j].part.add('sx-current')
      }
    }

    this.updateLockedState(region, p)
    dispatch('sx:current-performance-changed', { 
      sessionId: this.sessionId, 
      performanceId: performance.id,
      startTime: performance.startTime,
      endTime: performance.endTime,
      forced: true
    })

    this.disableDragSelection = this.regions.enableDragSelection({
      // color: 'rgba(206.6, 226, 254.6, 0.5)',
      drag: false
    })
  }

  private onAppPerformanceUpdated(performance: Performance) { log(arguments)()
    if(performance.sessionId != this.sessionId) {
      return
    }

    let region = this.findRegion(performance.id)
    let p = this.performances.find(performance.id)

    if(!region || !p) {
      return
    }

    region.setOptions({ id : performance.id, content: performance.tuneName })
    var el = region.element
    if(el) {
      el.part.add('sx-tune')
      if(this.editing) {
        el.part.add('sx-editable')
        for(var j = 0; j < el.children.length; j++) {
          el.children[j].part.add('sx-editable')
        }
      }
      if(p.current) {
        el.part.add('sx-current')
        for(var j = 0; j < el.children.length; j++) {
          el.children[j].part.add('sx-current')
        }
      }
      if(p.prevNeighbour && p.prevNeighbour.locked) {
        el.part.add('sx-locked-left')
      }
      if(p.nextNeighbour && p.nextNeighbour.locked) {
        el.part.add('sx-locked-right')
      }
    }
    p.update(performance.tuneId, performance.tuneName, performance.startTime, performance.endTime)
  }

  private onAppPerformanceDeleted(performance: Performance) { log(arguments)()
    if(performance.sessionId != this.sessionId) {
      return
    }

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

  private onAppEditingStart() { log(arguments)()
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

  private onAppEditingStop() { log(arguments)()
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
      this.disableDragSelection = this.regions.enableDragSelection({
        // color: 'rgba(206.6, 226, 254.6, 0.5)',
        drag: false
      })
      return
    }

    dispatch('sx:performance-creating', { 
      sessionId: this.sessionId, 
      startTime: performance.startTime, 
      endTime: performance.endTime 
    })
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
    dispatch('sx:performance-updating', { 
      sessionId: this.sessionId, 
      performanceId: performance.id, 
      startTime: performance.startTime, 
      endTime: performance.endTime 
    })

    if(performance.prevNeighbour) {
      var prevRegion = this.findRegion(performance.prevNeighbour.performance.id)
      this.updateLockedState(prevRegion, performance.prevNeighbour?.performance)
      dispatch('sx:performance-updating', { 
        sessionId: this.sessionId, 
        performanceId: performance.prevNeighbour.performance.id, 
        startTime: performance.prevNeighbour.performance.startTime, 
        endTime: performance.prevNeighbour.performance.endTime 
      })
    }

    if(performance.nextNeighbour) {
      var nextRegion = this.findRegion(performance.nextNeighbour.performance.id)
      this.updateLockedState(nextRegion, performance.nextNeighbour?.performance)
      dispatch('sx:performance-updating', { 
        sessionId: this.sessionId, 
        performanceId: performance.nextNeighbour.performance.id, 
        startTime: performance.nextNeighbour.performance.startTime, 
        endTime: performance.nextNeighbour.performance.endTime 
      })
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
        for(var j = 0; j < el.children.length; j++) {
          el.children[j].part.add('sx-current')
        }
      } else {
        el.part.remove('sx-current')
        for(var j = 0; j < el.children.length; j++) {
          el.children[j].part.remove('sx-current')
        }
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
    

    for(var performance of this.performances) {
      var r = this.findRegion(performance.id)
      var el = r?.element
      if(el) {
        if(performance.current) {
          el.part.add('sx-current')
          for(var j = 0; j < el.children.length; j++) {
            el.children[j].part.add('sx-current')
          }
        } else {
          el.part.remove('sx-current')
          for(var j = 0; j < el.children.length; j++) {
            el.children[j].part.remove('sx-current')
          }
        }
      }
    }

    if(oldCurrent?.id !== current?.id) {
      dispatch('sx:current-performance-changed', { 
        sessionId: this.sessionId, 
        performanceId: current?.id,
        startTime: current?.startTime,
        endTime: current?.endTime,
        forced: false
      })
    }
  }

  private onRegionOut(region: Region) { log(arguments)()
    var oldCurrent = this.performances.getCurrent()
    this.performances.out(region.id)
    var current = this.performances.getCurrent()
    if(oldCurrent?.id !== current?.id) {
      dispatch('sx:current-performance-changed', { 
        sessionId: this.sessionId, 
        performanceId: current?.id,
        startTime: current?.startTime,
        endTime: current?.endTime,
        forced: false
      })
    }

    for(var performance of this.performances) {
      var r = this.findRegion(performance.id)
      var el = r?.element
      if(el) {
        if(performance.current) {
          el.part.add('sx-current')
          for(var j = 0; j < el.children.length; j++) {
            el.children[j].part.add('sx-current')
          }
        } else {
          el.part.remove('sx-current')
          for(var j = 0; j < el.children.length; j++) {
            el.children[j].part.remove('sx-current')
          }
        }
      }
    }
  }

  private findRegion(regionId: string) : Region | undefined { log(arguments)()
    return this.regions.getRegions().find((r, _) => r.id == regionId)
  }
}