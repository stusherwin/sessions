import EventEmitter from './event-emitter'

export type SessionEvents = {
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
  'song-name-updated': [string, string]
}

var delta = 5;

export class Session extends EventEmitter<SessionEvents> {
  id: string
  filename: string
  songs: Song[] = []
  nextSongId: number = 1
  playing: boolean = false
  editing: boolean = false

  constructor(id: string, filename: string) {
    super()
    this.id = id
    this.filename = filename
  }

  create(startTime: number, endTime: number) {
    var newSong = new Song('song-' + this.nextSongId, 'Song ' + this.nextSongId, startTime, endTime)

    if(!this.songs.length) {
      this.songs = [newSong]
      this.nextSongId++
      return newSong;
    }

    for(var i = 0; i < this.songs.length; i++) {
      let song = this.songs[i]
      if(newSong.startTime < song.startTime && song.endTime < newSong.endTime) {
        return null;
      }
    }

    var newAll = []
    var pushed = false
    for(var i = 0; i < this.songs.length; i++) {
      let song = this.songs[i]

      //       [ A ]       [ B ]
      // <-1->
      if(!pushed && newSong.startTime < song.startTime && newSong.endTime < song.startTime) {
        var prevNeighbour = song.prevNeighbour
        if(prevNeighbour) {
          prevNeighbour.song.nextNeighbour = new SongNeighbour(newSong, prevNeighbour.locked)
        }
        newSong.prevNeighbour = prevNeighbour
        newSong.nextNeighbour = new SongNeighbour(song, false)
        newAll.push(newSong)
        pushed = true
        song.prevNeighbour = new SongNeighbour(newSong, false)
      //       [ A ]       [ B ]
      //     <-2->
      } else if(!pushed && newSong.startTime < song.startTime && song.startTime < newSong.endTime && newSong.endTime < song.endTime) {
        var prevNeighbour = song.prevNeighbour
        if(prevNeighbour) {
          prevNeighbour.song.nextNeighbour = new SongNeighbour(newSong, prevNeighbour.locked)
        }
        newSong.endTime = song.startTime
        newSong.prevNeighbour = prevNeighbour
        newSong.nextNeighbour = new SongNeighbour(song, true)
        newAll.push(newSong)
        pushed = true
        song.prevNeighbour = new SongNeighbour(newSong, true)
      }

      newAll.push(song)

      //       [ A ]       [ B ]
      //         <-3->
      if(!pushed && song.startTime < newSong.startTime && newSong.startTime < song.endTime && song.endTime < newSong.endTime) {
        var nextNeighbour = song.nextNeighbour
        if(nextNeighbour) {
          nextNeighbour.song.prevNeighbour = new SongNeighbour(newSong, nextNeighbour.locked)
        }
        newSong.startTime = song.endTime
        newSong.prevNeighbour = new SongNeighbour(song, true)
        newSong.nextNeighbour = nextNeighbour
        song.nextNeighbour = new SongNeighbour(newSong, true)
        newAll.push(newSong)
        pushed = true
      //       [ A ]       [ B ]
      //             <-4->
      } else if(!pushed && song.endTime < newSong.startTime && i == this.songs.length - 1) {
        newSong.prevNeighbour = new SongNeighbour(song, false)
        newSong.nextNeighbour = song.nextNeighbour
        song.nextNeighbour = new SongNeighbour(newSong, false)
        newAll.push(newSong)
        pushed = true
      }
    }

    this.songs = newAll
    this.nextSongId++

    return newSong
  }

  find(id: string) : Song | undefined {
    return this.songs.find(s => s.id == id)
  }

  findNext(time: number) : Song | undefined {
    for(var i = 0; i < this.songs.length; i++) {
      var song = this.songs[i]
      if(song.startTime > time) {
        return song
      }
    }
  }

  findPrevious(time: number) : Song | undefined {
    for(var i = this.songs.length - 1; i >= 0; i--) {
      var song = this.songs[i]
      if(song.startTime < time - delta) {
        return song
      }
    }
  }

  in(id: string) {
    for(var i = 0; i < this.songs.length; i++) {
      let song = this.songs[i]
      song.current = song.id === id
    }
  }

  out(id: string) {
    for(var i = 0; i < this.songs.length; i++) {
      let song = this.songs[i]
      if(song.id === id) {
        song.current = false
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

  updateSongName(id: string, name: string) {
    this.emit('song-name-updated', id, name)
  }
}

class SongNeighbour {
  song: Song
  locked: boolean

  constructor(song: Song, locked: boolean) {
    this.song = song
    this.locked = locked
  }
}

export class Song {
  id: string
  name: string
  startTime: number
  endTime: number
  current: boolean = false
  prevNeighbour: SongNeighbour | undefined = undefined
  nextNeighbour: SongNeighbour | undefined = undefined

  constructor(id: string, name: string, startTime: number, endTime: number) {
    this.id = id
    this.name = name
    this.startTime = startTime
    this.endTime = endTime
  }

  update(startTime: number, endTime: number) {
    if(this.prevNeighbour) {
      if(this.prevNeighbour.locked) {
        this.prevNeighbour.song.endTime = startTime
      } else {
        if(startTime < this.prevNeighbour.song.endTime) {
          startTime = this.prevNeighbour.song.endTime
        }
      }
    }

    if(this.nextNeighbour) {
      if(this.nextNeighbour.locked) {
        this.nextNeighbour.song.startTime = endTime
      } else {
        if(this.nextNeighbour.song.startTime < endTime) {
          endTime = this.nextNeighbour.song.startTime
        }
      }
    }

    this.startTime = startTime
    this.endTime = endTime
  }

  lockNeighbours() {
    if(this.prevNeighbour && this.startTime == this.prevNeighbour.song.endTime) {
      this.prevNeighbour.locked = true;
      this.prevNeighbour.song.nextNeighbour = new SongNeighbour(this, true);
    }

    if(this.nextNeighbour && this.endTime == this.nextNeighbour.song.startTime) {
      this.nextNeighbour.locked = true;
      this.nextNeighbour.song.prevNeighbour = new SongNeighbour(this, true);
    }
  }
}

export default Session