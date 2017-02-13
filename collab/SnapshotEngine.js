import computeSnapshot from './computeSnapshot'

/*
  API for creating and retrieving document snapshots
*/
class SnapshotEngine {
  constructor(config) {
    this.changeStore = config.changeStore
    this.snapshotStore = config.snapshotStore
  }

  /*
    Compute snapshot for given documentId and version

    Example: Let's assume we want to request a snapshot for a new version 20.
    Now getClosestSnapshot will give us version 15. This requires us to fetch
    the changes since version 16 and apply those, plus the very new change.
  */
  getSnapshot(documentId, version, cb) {
    this._getClosestSnapshot(documentId, version, (err, snapshot, closestVersion) => {
      if (err) {
        return cb(err)
      }
      if (snapshot && version === closestVersion) {
        // We don't need to fetch additional changes
        return cb(null, this._readSnapshot(snapshot, []), version)
      }
      let knownVersion
      if (snapshot) {
        knownVersion = closestVersion
      } else {
        knownVersion = 0 // we need to fetch all changes
      }

      // Now we get the remaining changes after the known version
      this.changeStore.getChanges(documentId, knownVersion, version, (err, changes) => {
        if (err) return cb(err)
        if (changes.length < (version - knownVersion)) {
          return cb('Changes missing for reconstructing version '+ version)
        }
        cb(null, this._readSnapshot(snapshot, changes), version)
      })
    })
  }

  _readSnapshot(rawSnapshot, changes) {
    console.info('_readSnapshot', rawSnapshot, changes)
    let snapshot
    if (rawSnapshot) {
      snapshot = JSON.parse(rawSnapshot)
    } else {
      console.info('Building snapshot from scratch.')
      snapshot = { nodes: {} }
    }
    snapshot = computeSnapshot(snapshot, changes)
    return JSON.stringify(snapshot)
  }

  /*
    Creates a snapshot
  */
  createSnapshot(documentId, version, cb) {
    this.getSnapshot(documentId, version, (err, snapshot) => {
      if (err) return cb(err)
      this.snapshotStore.saveSnapshot(documentId, version, snapshot, cb)
    })
  }

  _getClosestSnapshot(documentId, version, cb) {
    let closestVersion

    this.snapshotStore.getVersions(documentId, (err, versions) => {
      if (versions.indexOf(version) >= 0) {
        closestVersion = version
      } else {
        // We don't have a snaphot for that requested version
        let smallerVersions = versions.filter(function(v) {
          return parseInt(v, 10) < version
        })
        // Take the closest version if there is any
        closestVersion = Math.max.apply(null, smallerVersions)
      }
      if (!closestVersion) {
        return cb(null, undefined)
      }
      this.snapshotStore.getSnapshot(documentId, version, cb)
    })
  }
}

export default SnapshotEngine
