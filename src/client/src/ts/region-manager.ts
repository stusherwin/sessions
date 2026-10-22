import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import type { Region } from 'wavesurfer.js/dist/plugins/regions.esm.js'
import type { Performance } from './data.ts'
import { PerformanceRegionCollection } from './performance-region-collection.ts'
import { PerformanceRegion } from './performance-region-collection.ts'
import { dispatch, listen, log } from './common.ts'

var delta = 5;

export class RegionManager {
  private splittingTune: string | undefined = undefined
  private sessionId: string
  private performances: PerformanceRegionCollection
  private initialPerformanceId: string | undefined
  private regions: RegionsPlugin
  private editing: boolean = false
  private adding: boolean = false
  private playing: boolean = false
  private tuneMode: boolean = false
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
    subscribe(listen('sx:adding-start', this.onAppAddingStart.bind(this)))
    subscribe(listen('sx:adding-stop', this.onAppAddingStop.bind(this)))
    subscribe(listen('sx:tune-mode-start', this.onAppTuneModeStart.bind(this)))
    subscribe(listen('sx:tune-mode-stop', this.onAppTuneModeStop.bind(this)))
    subscribe(listen('sx:playing-start', this.onAppPlayingStart.bind(this)))
    subscribe(listen('sx:playing-stop', this.onAppPlayingStop.bind(this)))
    subscribe(listen('sx:break-from-previous', this.onAppBreakFromPrevious.bind(this)))
    subscribe(listen('sx:break-from-next', this.onAppBreakFromNext.bind(this)))
    subscribe(listen('sx:nudge-start-backward', this.onAppNudgeStartBackward.bind(this)))
    subscribe(listen('sx:nudge-start-forward', this.onAppNudgeStartForward.bind(this)))
    subscribe(listen('sx:nudge-end-backward', this.onAppNudgeEndBackward.bind(this)))
    subscribe(listen('sx:nudge-end-forward', this.onAppNudgeEndForward.bind(this)))
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
   
  splitCurrentTune(currentTime: number) { log(arguments)()
    var p = this.performances.getCurrent();
    if(!p) {
      return
    }

    this.splittingTune = p.id

    let region = this.findRegion(p.id)

    if(!region || currentTime < region.start + 10 || currentTime > region.end - 10) {
      return
    }

    var end = p.endTime;

    this.regions.addRegion({start: currentTime, end, id: 'creating'})

    dispatch('sx:performance-updating', { 
      sessionId: this.sessionId, 
      performanceId: p.id, 
      startTime: p.startTime, 
      endTime: currentTime 
    })

    this.splittingTune = undefined

    region = this.findRegion(p.id)
    p = this.performances.getCurrent();
    if(!p) {
      return
    }
    this.updateLockedState(region, p)

    var prevNeighbour = p.prevNeighbour
    if(prevNeighbour) {
      let prevRegion = this.findRegion(prevNeighbour.performance.id)

      this.updateLockedState(prevRegion, prevNeighbour.performance)
    }

    var nextNeighbour = p.nextNeighbour
    if(nextNeighbour) {
      let nextRegion = this.findRegion(nextNeighbour.performance.id)

      this.updateLockedState(nextRegion, nextNeighbour.performance)
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

    region.setOptions({ 
      id : performance.id, 
      content: performance.tuneName, 
      start: performance.startTime, 
      end: performance.endTime 
    })
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
      canBreakPrevious: p.prevNeighbour && p.prevNeighbour.locked,
      canBreakNext: p.nextNeighbour && p.nextNeighbour.locked,
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

    if(this.splittingTune) {
      this.performances.fix(performance.id, performance.startTime, performance.endTime)
      p = this.performances.find(performance.id)
      if(!p) {
        return
      }
    }

    region.setOptions({ id : performance.id, content: performance.tuneName, start: p.startTime, end: p.endTime })

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

    if(!this.splittingTune) {
      p.update(performance.tuneId, performance.tuneName, performance.startTime, performance.endTime)
    }
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

    this.editing = false
  }

  private onAppAddingStart() { log(arguments)()
    this.adding = true
    
    this.disableDragSelection = this.regions.enableDragSelection({
      // color: 'rgba(206.6, 226, 254.6, 0.5)',
      drag: false
    })
  }

  private onAppAddingStop() { log(arguments)()
    if(this.disableDragSelection) {
      this.disableDragSelection()
      this.disableDragSelection = undefined
    }

    this.adding = false
  }

  private onAppTuneModeStart() { log(arguments)()
    this.tuneMode = true
  }

  private onAppTuneModeStop() { log(arguments)()
    this.tuneMode = false
  }

  private onAppPlayingStart() { log(arguments)()
    this.playing = true
  }

  private onAppPlayingStop() { log(arguments)()
    this.playing = false
  }

  private onAppBreakFromPrevious() { log(arguments)()
    var p = this.performances.getCurrent();
    if(!p) {
      return
    }

    let region = this.findRegion(p.id)
    if(!region) {
      return
    }

    this.performances.fix(p.id, p.startTime + 0.5, p.endTime)
    p = this.performances.find(p.id)
    if(!p) {
      return
    }

    region.setOptions({ id : p.id, content: p.tuneName, start: p.startTime, end: p.endTime })

    this.updateLockedState(region, p)

    if(p.prevNeighbour) {
      var prevRegion = this.findRegion(p.prevNeighbour.performance.id)
      prevRegion?.setOptions({ start: p.prevNeighbour.performance.startTime, end: p.prevNeighbour.performance.endTime })
      this.updateLockedState(prevRegion, p.prevNeighbour?.performance)
    }

    if(p.nextNeighbour) {
      var nextRegion = this.findRegion(p.nextNeighbour.performance.id)
      nextRegion?.setOptions({ start: p.nextNeighbour.performance.startTime, end: p.nextNeighbour.performance.endTime })
      this.updateLockedState(nextRegion, p.nextNeighbour?.performance)
    }

    dispatch('sx:performance-updating', { 
      sessionId: this.sessionId, 
      performanceId: p.id, 
      startTime: p.startTime, 
      endTime: p.endTime 
    })

    dispatch('sx:current-performance-changed', { 
      sessionId: this.sessionId, 
      performanceId: p.id,
      startTime: p.startTime,
      endTime: p.endTime,
      canBreakPrevious: p.prevNeighbour && p.prevNeighbour.locked,
      canBreakNext: p.nextNeighbour && p.nextNeighbour.locked,
      forced: false
    })
  }

  private onAppBreakFromNext() { log(arguments)()
    var p = this.performances.getCurrent();
    if(!p) {
      return
    }

    let region = this.findRegion(p.id)
    if(!region) {
      return
    }

    this.performances.fix(p.id, p.startTime, p.endTime - 0.5)
    p = this.performances.find(p.id)
    if(!p) {
      return
    }

    region.setOptions({ id : p.id, content: p.tuneName, start: p.startTime, end: p.endTime })

    this.updateLockedState(region, p)

    if(p.prevNeighbour) {
      var prevRegion = this.findRegion(p.prevNeighbour.performance.id)
      prevRegion?.setOptions({ start: p.prevNeighbour.performance.startTime, end: p.prevNeighbour.performance.endTime })
      this.updateLockedState(prevRegion, p.prevNeighbour?.performance)
    }

    if(p.nextNeighbour) {
      var nextRegion = this.findRegion(p.nextNeighbour.performance.id)
      nextRegion?.setOptions({ start: p.nextNeighbour.performance.startTime, end: p.nextNeighbour.performance.endTime })
      this.updateLockedState(nextRegion, p.nextNeighbour?.performance)
    }

    dispatch('sx:performance-updating', { 
      sessionId: this.sessionId, 
      performanceId: p.id, 
      startTime: p.startTime, 
      endTime: p.endTime 
    })

    dispatch('sx:current-performance-changed', { 
      sessionId: this.sessionId, 
      performanceId: p.id,
      startTime: p.startTime,
      endTime: p.endTime,
      canBreakPrevious: p.prevNeighbour && p.prevNeighbour.locked,
      canBreakNext: p.nextNeighbour && p.nextNeighbour.locked,
      forced: false
    })
  }

  private onAppNudgeStartBackward() { log(arguments)()
    var performance = this.performances.getCurrent();
    if(!performance) {
      return
    }

    let region = this.findRegion(performance.id)
    if(!region) {
      return
    }

    performance.update(performance.tuneId, performance.tuneName, region.start - 0.5, region.end)
    region.setOptions({ start: performance.startTime, end: performance.endTime })

    this.updateLockedState(region, performance)
    dispatch('sx:performance-updating', { 
      sessionId: this.sessionId, 
      performanceId: performance.id, 
      startTime: performance.startTime, 
      endTime: performance.endTime 
    })

    if(performance.prevNeighbour) {
      var prevRegion = this.findRegion(performance.prevNeighbour.performance.id)
      prevRegion?.setOptions({ start: performance.prevNeighbour.performance.startTime, end: performance.prevNeighbour.performance.endTime })
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
      nextRegion?.setOptions({ start: performance.nextNeighbour.performance.startTime, end: performance.nextNeighbour.performance.endTime })
      this.updateLockedState(nextRegion, performance.nextNeighbour?.performance)
      dispatch('sx:performance-updating', { 
        sessionId: this.sessionId, 
        performanceId: performance.nextNeighbour.performance.id, 
        startTime: performance.nextNeighbour.performance.startTime, 
        endTime: performance.nextNeighbour.performance.endTime 
      })
    }
  }

  private onAppNudgeStartForward() { log(arguments)()
    var performance = this.performances.getCurrent();
    if(!performance) {
      return
    }

    let region = this.findRegion(performance.id)
    if(!region) {
      return
    }

    performance.update(performance.tuneId, performance.tuneName, region.start + 0.5, region.end)
    region.setOptions({ start: performance.startTime, end: performance.endTime })

    this.updateLockedState(region, performance)
    dispatch('sx:performance-updating', { 
      sessionId: this.sessionId, 
      performanceId: performance.id, 
      startTime: performance.startTime, 
      endTime: performance.endTime 
    })

    if(performance.prevNeighbour) {
      var prevRegion = this.findRegion(performance.prevNeighbour.performance.id)
      prevRegion?.setOptions({ start: performance.prevNeighbour.performance.startTime, end: performance.prevNeighbour.performance.endTime })
      this.updateLockedState(prevRegion, performance.prevNeighbour.performance)
      dispatch('sx:performance-updating', { 
        sessionId: this.sessionId, 
        performanceId: performance.prevNeighbour.performance.id, 
        startTime: performance.prevNeighbour.performance.startTime, 
        endTime: performance.prevNeighbour.performance.endTime 
      })
    }

    if(performance.nextNeighbour) {
      var nextRegion = this.findRegion(performance.nextNeighbour.performance.id)
      nextRegion?.setOptions({ start: performance.nextNeighbour.performance.startTime, end: performance.nextNeighbour.performance.endTime })
      this.updateLockedState(nextRegion, performance.nextNeighbour?.performance)
      dispatch('sx:performance-updating', { 
        sessionId: this.sessionId, 
        performanceId: performance.nextNeighbour.performance.id, 
        startTime: performance.nextNeighbour.performance.startTime, 
        endTime: performance.nextNeighbour.performance.endTime 
      })
    }
  }

  private onAppNudgeEndBackward() { log(arguments)()
    var performance = this.performances.getCurrent();
    if(!performance) {
      return
    }

    let region = this.findRegion(performance.id)
    if(!region) {
      return
    }

    performance.update(performance.tuneId, performance.tuneName, region.start, region.end - 0.5)
    region.setOptions({ start: performance.startTime, end: performance.endTime })

    this.updateLockedState(region, performance)
    dispatch('sx:performance-updating', { 
      sessionId: this.sessionId, 
      performanceId: performance.id, 
      startTime: performance.startTime, 
      endTime: performance.endTime 
    })

    if(performance.prevNeighbour) {
      var prevRegion = this.findRegion(performance.prevNeighbour.performance.id)
      prevRegion?.setOptions({ start: performance.prevNeighbour.performance.startTime, end: performance.prevNeighbour.performance.endTime })
      this.updateLockedState(prevRegion, performance.prevNeighbour.performance)
      dispatch('sx:performance-updating', { 
        sessionId: this.sessionId, 
        performanceId: performance.prevNeighbour.performance.id, 
        startTime: performance.prevNeighbour.performance.startTime, 
        endTime: performance.prevNeighbour.performance.endTime 
      })
    }

    if(performance.nextNeighbour) {
      var nextRegion = this.findRegion(performance.nextNeighbour.performance.id)
      nextRegion?.setOptions({ start: performance.nextNeighbour.performance.startTime, end: performance.nextNeighbour.performance.endTime })
      this.updateLockedState(nextRegion, performance.nextNeighbour?.performance)
      dispatch('sx:performance-updating', { 
        sessionId: this.sessionId, 
        performanceId: performance.nextNeighbour.performance.id, 
        startTime: performance.nextNeighbour.performance.startTime, 
        endTime: performance.nextNeighbour.performance.endTime 
      })
    }
  }

  private onAppNudgeEndForward() { log(arguments)()
    var performance = this.performances.getCurrent();
    if(!performance) {
      return
    }

    let region = this.findRegion(performance.id)
    if(!region) {
      return
    }

    performance.update(performance.tuneId, performance.tuneName, region.start, region.end + 0.5)
    region.setOptions({ start: performance.startTime, end: performance.endTime })

    this.updateLockedState(region, performance)
    dispatch('sx:performance-updating', { 
      sessionId: this.sessionId, 
      performanceId: performance.id, 
      startTime: performance.startTime, 
      endTime: performance.endTime 
    })

    if(performance.prevNeighbour) {
      var prevRegion = this.findRegion(performance.prevNeighbour.performance.id)
      prevRegion?.setOptions({ start: performance.prevNeighbour.performance.startTime, end: performance.prevNeighbour.performance.endTime })
      this.updateLockedState(prevRegion, performance.prevNeighbour.performance)
      dispatch('sx:performance-updating', { 
        sessionId: this.sessionId, 
        performanceId: performance.prevNeighbour.performance.id, 
        startTime: performance.prevNeighbour.performance.startTime, 
        endTime: performance.prevNeighbour.performance.endTime 
      })
    }

    if(performance.nextNeighbour) {
      var nextRegion = this.findRegion(performance.nextNeighbour.performance.id)
      nextRegion?.setOptions({ start: performance.nextNeighbour.performance.startTime, end: performance.nextNeighbour.performance.endTime })
      this.updateLockedState(nextRegion, performance.nextNeighbour?.performance)
      dispatch('sx:performance-updating', { 
        sessionId: this.sessionId, 
        performanceId: performance.nextNeighbour.performance.id, 
        startTime: performance.nextNeighbour.performance.startTime, 
        endTime: performance.nextNeighbour.performance.endTime 
      })
    }
  }

  private onRegionInitialized(region: Region) { log(arguments)()
    if(!this.adding && !this.splittingTune) {
      return
    }

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

    if(!this.adding && !this.splittingTune) {
      region.remove()
      return
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
      if(!side) {
        console.log('side is null somehow')
        return
      }

      if(region && region.element) {
        if(region.element.part) {
          region.element.part.add('sx-locked-' + side)
        }
        var handle = region.element.querySelector('::part(region-handle-' + side + ')')
        if(handle) {
          handle.part.add('sx-locked')
        }
      }
    }

    function unlock(region: Region | undefined, side: string) { log(arguments)()
      if(!side) {
        console.log('side is null somehow')
        return
      }

      if(region && region.element) {
        if(region.element.part) {
          region.element.part.remove('sx-locked-' + side)
        }
        var handle = region.element.querySelector('::part(region-handle-' + side + ')')
        if(handle) {
          handle.part.remove('sx-locked')
        }
      }
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
        canBreakPrevious: current?.prevNeighbour && current.prevNeighbour.locked,
        canBreakNext: current?.nextNeighbour && current.nextNeighbour.locked,
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
        canBreakPrevious: current?.prevNeighbour && current.prevNeighbour.locked,
        canBreakNext: current?.nextNeighbour && current.nextNeighbour.locked,
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

    if(this.playing) {
      if(this.tuneMode) {
        if(!current && oldCurrent) {
          if(oldCurrent.nextNeighbour) {
            var r = this.findRegion(oldCurrent.nextNeighbour.performance.id)
            if(r) {
              r.play()
            }
          }
        }
      }
    }
  }

  private findRegion(regionId: string) : Region | undefined { log(arguments)()
    return this.regions.getRegions().find((r, _) => r.id == regionId)
  }
}