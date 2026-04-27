import EventEmitter from './event-emitter'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import type { Region } from 'wavesurfer.js/dist/plugins/regions.esm.js'
import type { TunePerformance } from './data.ts'
import { TuneRegionCollection } from './tune-region-collection.ts'
import type { TuneRegion } from './tune-region-collection.ts'

var delta = 5;

export class TuneRegionManager extends EventEmitter<TuneRegionManagerEvents> {
  regions: RegionsPlugin
  tunes: TuneRegionCollection
  editing: boolean = false
  creating: boolean = false
  subscriptions: (() => void)[] = []
  disableDragSelection : (() => void) | undefined = undefined

  constructor(tunes: TunePerformance[], regions: RegionsPlugin) {
    super()
 
    this.regions = regions
    this.tunes = new TuneRegionCollection(tunes)
  }

  init() {
    for(var tune of this.tunes) {
      var region = this.regions.addRegion({ 
        id: tune.tuneId, 
        content: tune.tuneName, 
        start: tune.startTime, 
        end: tune.endTime, 
        drag: false, 
        resize: false 
      })
      region.element?.part.add('sx-tune')
      if(tune.prevNeighbour && tune.prevNeighbour.locked) {
        region.element?.part.add('sx-locked-left')
      }
      if(tune.nextNeighbour && tune.nextNeighbour.locked) {
        region.element?.part.add('sx-locked-right')
      }
    }
    
    const subscribe = (unsubscribe: () => void) => this.subscriptions.push(unsubscribe)

    subscribe(this.regions.on('region-initialized', r => this.onRegionInitialized(r)))
    subscribe(this.regions.on('region-created', r => this.onRegionCreated(r)))
    subscribe(this.regions.on('region-update', r => this.regionUpdate(r)))
    subscribe(this.regions.on('region-updated', r => this.regionUpdated(r)))
    subscribe(this.regions.on('region-in', r => this.regionIn(r)))
    subscribe(this.regions.on('region-out', r => this.regionOut(r)))
  }

  unload() {
    for(var unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions = [];
  }

  findRegion(regionId: string) : Region | undefined {
    if(!this.regions) {
        return
    }

    return this.regions.getRegions().find((r, _) => r.id == regionId)
  }

  findNext(time: number) : TuneRegion | undefined {
    for(var tune of this.tunes) {
      if(tune.startTime > time) {
        return tune
      }
    }
  }

  findPrevious(time: number) : TuneRegion | undefined {
    for(var tune of this.tunes.reversed()) {
      if(tune.startTime < time - delta) {
        return tune
      }
    }
  }

  onRegionInitialized(region: Region) {
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

  onRegionCreated(region: Region) {
    if(this.disableDragSelection) {
      this.disableDragSelection()
    }

    var tune = this.tunes.tryCreate(region.start, region.end)
    if(!tune) {
      region.remove()
      this.creating = false
      this.disableDragSelection = this.regions.enableDragSelection({
        // color: 'rgba(206.6, 226, 254.6, 0.5)',
        drag: false
      })
      return
    }

    this.emit('tune-region-creating', tune.startTime, tune.endTime)
  }
  
  create(perf: TunePerformance) {
    var region = this.findRegion("creating")

    if(!region) {
      this.creating = false
      this.disableDragSelection = this.regions.enableDragSelection({
        // color: 'rgba(206.6, 226, 254.6, 0.5)',
        drag: false
      })
      return
    }

    var tune = this.tunes.add(perf)

    region.setOptions({ id : perf.tuneId, content: perf.tuneName, start: perf.startTime, end: perf.endTime })
    var el = region.element
    if(el) {
      el.part.add('sx-tune')
      el.part.add('sx-editable')
      for(var j = 0; j < el.children.length; j++) {
        el.children[j].part.add('sx-editable')
      }
    }

    this.updateLockedState(region, tune)
    this.emit('tune-region-created', region.start, region.end)

    this.creating = false
    this.disableDragSelection = this.regions.enableDragSelection({
      // color: 'rgba(206.6, 226, 254.6, 0.5)',
      drag: false
    })
  }

  regionUpdate(region: Region) {
    let tune = this.tunes.find(region.id);

    if(!tune) {
      return
    }

    tune.update(region.start, region.end)
    region.setOptions({ start: tune.startTime, end: tune.endTime })

    this.updateLockedState(region, tune)

    if(tune.prevNeighbour) {
      var prevRegion = this.findRegion(tune.prevNeighbour.tune.tuneId)
      prevRegion?.setOptions({ start: tune.prevNeighbour.tune.startTime, end: tune.prevNeighbour.tune.endTime })
      this.updateLockedState(prevRegion, tune.prevNeighbour?.tune)
    }

    if(tune.nextNeighbour) {
      var nextRegion = this.findRegion(tune.nextNeighbour.tune.tuneId)
      nextRegion?.setOptions({ start: tune.nextNeighbour.tune.startTime, end: tune.nextNeighbour.tune.endTime })
      this.updateLockedState(nextRegion, tune.nextNeighbour?.tune)
    }
  }

  regionUpdated(region: Region) {
    let tune = this.tunes.find(region.id);

    if(!tune) {
      return
    }

    tune.lockNeighbours()
    this.updateLockedState(region, tune)
    this.emit('tune-region-updating', tune.tuneId, tune.startTime, tune.endTime)

    if(tune.prevNeighbour) {
      var prevRegion = this.findRegion(tune.prevNeighbour.tune.tuneId)
      this.updateLockedState(prevRegion, tune.prevNeighbour?.tune)
      this.emit('tune-region-updating', tune.prevNeighbour.tune.tuneId, tune.prevNeighbour.tune.startTime, tune.prevNeighbour.tune.endTime)
    }

    if(tune.nextNeighbour) {
      var nextRegion = this.findRegion(tune.nextNeighbour.tune.tuneId)
      this.updateLockedState(nextRegion, tune.nextNeighbour?.tune)
      this.emit('tune-region-updating', tune.nextNeighbour.tune.tuneId, tune.nextNeighbour.tune.startTime, tune.nextNeighbour.tune.endTime)
    }
  }

  updateName(perf: TunePerformance) {
    let region = this.findRegion(perf.tuneId)
    let tune = this.tunes.find(perf.tuneId);

    if(!region || !tune) {
      return
    }

    region.setContent(perf.tuneName || '')
    tune.updateName(perf.tuneName)
  }

  update(perf: TunePerformance) {
  }

  delete(perf: TunePerformance) {
    let region = this.findRegion(perf.tuneId)
    let tune = this.tunes.find(perf.tuneId);

    if(!region || !tune) {
      return
    }

    var prevNeighbour = tune.prevNeighbour;
    var nextNeighbour = tune.nextNeighbour;

    region.remove()
    this.tunes.delete(perf.tuneId)

    if(prevNeighbour) {
      let prevRegion = this.findRegion(prevNeighbour.tune.tuneId)

      this.updateLockedState(prevRegion, prevNeighbour.tune)
    }

    if(nextNeighbour) {
      let nextRegion = this.findRegion(nextNeighbour.tune.tuneId)

      this.updateLockedState(nextRegion, nextNeighbour.tune)
    }
  }

  updateLockedState(region : Region | undefined, tune: TuneRegion) {
    var el = region?.element
    if(el) {
      el.part.add('sx-tune')
      if(this.editing) {
        el.part.add('sx-editable')
        for(var j = 0; j < el.children.length; j++) {
          el.children[j].part.add('sx-editable')
        }
      }
      if(tune.current) {
        el.part.add('sx-current')
      } else {
        el.part.remove('sx-current')
      }
    }

    function lock(region: Region | undefined, side: string) {
      region?.element?.part.add('sx-locked-' + side)
      var handle = region?.element?.querySelector('::part(region-handle-' + side + ')')
      handle?.part.add('sx-locked')
    }

    function unlock(region: Region | undefined, side: string) {
      region?.element?.part.remove('sx-locked-' + side)
      var handle = region?.element?.querySelector('::part(region-handle-' + side + ')')
      handle?.part.remove('sx-locked')
    }

    if(tune.prevNeighbour) {
      tune.prevNeighbour.locked ? lock(region, 'left') : unlock(region, 'left')
      var prev = this.findRegion(tune.prevNeighbour.tune.tuneId)
      tune.prevNeighbour.locked ? lock(prev, 'left') : unlock(prev, 'left')
    } else {
      unlock(region, 'left')
    }

    if(tune.nextNeighbour) {
      tune.nextNeighbour.locked ? lock(region, 'left') : unlock(region, 'left')
      var next = this.findRegion(tune.nextNeighbour.tune.tuneId)
      tune.nextNeighbour.locked ? lock(next, 'left') : unlock(next, 'left')
    } else {
      unlock(region, 'right')
    }
  }

  startEditing() {
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

  stopEditing() {
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
  
  regionIn(region: Region) {
    var oldCurrent = this.tunes.getCurrent()
    this.tunes.in(region.id)
    var current = this.tunes.getCurrent()
    if(oldCurrent?.tuneId !== current?.tuneId) {
      this.emit('current-tune-region-changed', current?.tuneId)
    }

    for(var tune of this.tunes) {
      var r = this.findRegion(tune.tuneId)
      if(tune.current) {
        r?.element?.part.add('sx-current')
      } else {
        r?.element?.part.remove('sx-current')
      }
    }
  }

  regionOut(region: Region) {
    var oldCurrent = this.tunes.getCurrent()
    this.tunes.out(region.id)
    var current = this.tunes.getCurrent()
    if(oldCurrent?.tuneId !== current?.tuneId) {
      this.emit('current-tune-region-changed', current?.tuneId)
    }

    for(var tune of this.tunes) {
      var r = this.findRegion(tune.tuneId)
      if(tune.current) {
        r?.element?.part.add('sx-current')
      } else {
        r?.element?.part.remove('sx-current')
      }
    }
  }
}

type TuneRegionManagerEvents = {
  'tune-region-creating': [number, number]
  'tune-region-created': [number, number]
  'tune-region-updating': [string, number, number]
  'tune-region-updated': [string, number, number]
  'current-tune-region-changed': [string | undefined]
}
