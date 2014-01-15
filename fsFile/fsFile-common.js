if (Meteor.isClient) {
  // There is a single uploads transfer queue per client (not per CFS)
  FS.downloadQueue = new DownloadTransferQueue();

  // There is a single downloads transfer queue per client (not per CFS)
  FS.uploadQueue = new UploadTransferQueue();
}

/** @method FS.File
  * @namespace FS.File
  * @constructor
  * @param {object|File|Blob} ref File reference
  * @todo Should we refactor the file record into `self.record`?
  */
FS.File = function(ref, createdByTransform) {
  var self = this;

  self.createdByTransform = createdByTransform;

  if (typeof ref !== 'object')
    throw new Error('FS.File expects an object as argument');

  // Extend self with filerecord related data
  _.extend(self, cloneFileRecord(ref));

  if (typeof File !== "undefined" && ref instanceof File) {
    self.utime = ref.lastModifiedDate;
    self.blob = ref; // File inherits from Blob so this is OK
  } else if (typeof Blob !== "undefined" && ref instanceof Blob) {
    self.utime = new Date;
    self.blob = ref;
  }
};

/** @method FS.File.prototype.controlledByDeps
  * @returns {FS.Collection} Returns true if this FS.File is reactive
  *
  * > Note: Returns true if this FS.File object was created by a FS.Collection
  * > and we are in a reactive computations. What does this mean? Well it should
  * > mean that our fileRecord is fully updated by Meteor and we are mounted on
  * > a collection
  */
FS.File.prototype.controlledByDeps = function() {
  var self = this;
  return self.createdByTransform && Deps.active;
};

/** @method FS.File.prototype.getCollection
  * @returns {FS.Collection} Returns attatched collection or undefined if not mounted
  *
  * > Note: This will throw an error if collection not found and file is mounted
  * > *(got an invalid collectionName)*
  */
FS.File.prototype.getCollection = function() {
  // Get the collection reference
  var self = this;
  // If we allready made the link then do no more
  if (self.collection instanceof FS.Collection) {
    return self.collection;
  }
  // If we dont have a collectionName then theres not much to do, the file is
  // not mounted yet
  if (!self.collectionName) {
    // Should not throw an error here - could be common that the file is not
    // yet mounted into a collection
    return;
    // new Error('FS.File getCollection, Error: No FS.Collection found');
  }
  // Try to lookup the collectionName
  var collection = _collections[self.collectionName];
  // Test if its really a FS.Collection - Is this really needed?
  if (collection instanceof FS.Collection) {
    // Link the collection to the file
    self.collection = collection;
    // All good we simply return the collection
    return collection;
  } else {
    // This is clearly not intended so we throw an error
    // if images.files we use the images part since this is known to the user
    var prefix = self.collectionName.split('.')[0];
    new Error('FS.File getCollection, Error: FS.Collection "' + prefix + '" not found');
  }
};

/** @method FS.File.prototype.isMounted
  * @returns {FS.Collection} Returns attatched collection or undefined if not mounted
  *
  * > Note: This will throw an error if collection not found and file is mounted
  * > *(got an invalid collectionName)*
  */
FS.File.prototype.isMounted = FS.File.prototype.getCollection;

/** @method FS.File.prototype.fetch Returns the fileRecord
  * @returns {object} The filerecord
  * @deprecated Refactored into [getFileRecord](#FS.File.prototype.getFileRecord)
  */


/** @method FS.File.prototype.getFileRecord Returns the fileRecord
  * @returns {object} The filerecord
  */
FS.File.prototype.getFileRecord = function() {
  var self = this;
  // Check if this file object fileRecord is kept updated by Meteor, if so
  // return self
  if (self.controlledByDeps()) {
    return self;
  }
  // Go for manually updating the file record
  if (self.isMounted()) {
    console.log('GET FILERECORD: ' + self._id);

    // Return the fileRecord or an empty object
    var fileRecord = self.collection.files.findOne({_id: self._id}) || {};
    _.extend(self, fileRecord);
    return fileRecord;
  } else {
    // We return an empty object, this way users can still do `getRecord().size`
    // Without getting an error
    return {};
  }
};

/** @method FS.File.prototype.useCollection
  * @deprecated We should use `getCollection()` istead - it practically does the same
  */

/** @method FS.File.prototype.update
  * @param {modifier} modifier
  * @param {object} [options]
  * @param {function} [callback]
  */
// Update the fileRecord
FS.File.prototype.update = function(modifier, options, callback) {
  var self = this;
  console.log('UPDATE: ' + JSON.stringify(modifier));
  // Make sure we have options and callback
  if (!callback && typeof options === 'function') {
    callback = options;
    options = {};
  }

  if (self.isMounted()) {
    // Call collection update - File record
    return self.collection.files.update({_id: self._id}, modifier, options, function(err, count) {
      // Update the fileRecord if it was changed and on the client
      // The server-side methods will pull the fileRecord if needed
      if (count > 0 && Meteor.isClient) self.getFileRecord();
      // If we have a callback then call it
      if (typeof callback === 'function') callback(err, count);
    });
  }
};

/** @method FS.File.prototype.remove
  * @returns {number} Count
  * @todo Test this
  *
  * Remove the current file
  */
// Remove the file
FS.File.prototype.remove = function() {
  var self = this;
  // Remove any associated temp files
  if (Meteor.isServer) {
    TempStore.deleteChunks(self);
  }
  if (self.isMounted) {
    self.collection.files.remove({_id: self._id});
    delete self._id;
    delete self.binary;
  }
};

/** @method FS.File.prototype.moveTo
  * @param {FS.Collection} targetCollection
  * @private // Marked private until implemented
  * @todo Needs to be implemented
  *
  * Move the file from current collection to another collection
  *
  * > Note: Not yet implemented
  */

/** @method FS.File.prototype.get
  * @param {object} [options]
  * @param {string} [options.copyName='_master'] Name of the copy version
  * @param {number} [options.start]
  * @param {number} [options.end]
  * @returns {number} Count
  * 
  * Remove the current file
  */
// Client: Instructs the DownloadTransferQueue to begin downloading the file copy
// Server: Returns the Buffer data for the copy
FS.File.prototype.get = function(options) {
  var self = this;
  // Make sure options are set
  options = options || {};

  // Make sure copyName is set - we default to "_master"
  if (typeof options.copyName !== "string") {
    options.copyName = "_master";
  }
  
  // Call the client / server dependen code
  return self._get(options);
};

/** @method FS.File.prototype.url Construct the file url
  * @param {object} [options]
  * @param {string} [options.copy="_master"] The copy of the file to get
  * @param {boolean} [options.auth=null] Wether or not the authenticate
  * @param {boolean} [options.download=false] Should headers be set to force a download
  *
  * Return the http url for getting the file - on server set auth if wanting to
  * use authentication on client set auth to true or token
  */
FS.File.prototype.url = function(options) {
  var self = this;
  options = options || {};
  options = _.extend({
    copy: "_master",
    auth: null,
    download: false
  }, options.hash || options); // check for "hash" prop if called as helper

  // We check if the copy is found
  if (!self.hasCopy(options.copy, false)) {
    return null;
  }

  if (self.isMounted()) {

    if (!self.collection.httpUrl) {
      throw new Error('FS.File.url FS.Collection "' + self.collection.name + '" has no HTTP access point; set useHTTP option to true');
    }
    var authToken = '';

    // TODO: Could we somehow figure out if the collection requires login?
    if (options.auth) {
      if (options.auth === true) {
        authToken = (typeof Accounts !== "undefined" && Accounts._storedLoginToken()) || '';
      } else {
        authToken = options.auth || '';
      }

      if (authToken !== '') {
        // Construct the token string to append to url
        authToken = '?token=' + authToken;
      }
    }

    // Construct the http method url
    var urlPrefix = (options.download) ? '/download/' : '/';
    if (options.copy && options.copy !== "_master") {
      return self.collection.httpUrl + urlPrefix + self._id + '/' + options.copy + authToken;
    } else {
      return self.collection.httpUrl + urlPrefix + self._id + authToken;
    }
  }
  
};

/** @method FS.File.prototype.downloadUrl Get the download url
  * @param {object} [options]
  * @param {string} [options.copy="_master"] The copy of the file to get
  * @param {boolean} [options.auth=null] Wether or not the authenticate
  * @deprecated Use The hybrid helper `FS.File.url`
  */
// Construct a download url
FS.File.prototype.downloadUrl = function(options) {
  options = options || {};
  options = options.hash || options;
  options.download = true;
  return FS.File.prototype.url.call(this, options);
};

/** @method FS.File.prototype.put Stores the file data
  * @param {function} [callback] Callback for returning errors and updated FS.File
  *
```
  fo.put(function(err, fo) {
    if (err) {
      console.log('Got an error');
    } else {
      console.log('Passed on the file: ' + fo);
    }
  });
```
  */
FS.File.prototype.put = function(callback) {
  var self = this;

  callback = callback || defaultCallback;

  if (!self._id) {
    callback(new Error("FS.File.put needs _id"));
    return;
  }

  if (Meteor.isClient && !FS.uploadQueue.isUploadingFile(self)) {
    FS.uploadQueue.uploadFile(self);
    callback(null, self);
  } else if (Meteor.isServer) {
    // Force bytesUploaded to be equal to the file size in case
    // this was a server insert or a non-chunked client upload.
    self.update({$set: {bytesUploaded: self.size}}, function(err) {
      if (err) {
        callback(err);
      } else {
        // Now let the collection handle the storage adapters
        if (self.isMounted()) {
          self.collection.saveCopies(self, {missing: true});
          callback(null, self);
        }
      }
    });
  }
};

/** @method FS.File.prototype.getExtension Returns the file extension
  * @returns {string} The extension eg.: `jpg` or if not found then an empty string ''
  */
FS.File.prototype.getExtension = function() {
  var self = this;
    // Get the name from the fileRecord
    var name = self.getFileRecord().name || '';
    // Seekout the . if found
    var found = name.lastIndexOf('.') + 1;
    // Return the extension if found else ''
    return (found > 0 ? name.substr(found) : '');
};

/** @method FS.File.prototype.toDataUrl
  * @param {function} callback Callback(err, dataUrl) (callback is optional on server)
  * @todo Split client and server code
  */
FS.File.prototype.toDataUrl = function(callback) {
  var self = this;

  if (Meteor.isClient) {
    if (typeof callback !== 'function')
      throw new Error("toDataUrl requires function as callback");

    if (typeof FileReader === "undefined") {
      callback(new Error("Browser does not support FileReader"));
      return;
    }

    var fileReader = new FileReader();
    fileReader.onload = function(event) {
      callback(null, event.target.result);
    };
    fileReader.onerror = function(err) {
      callback(err);
    };
    try {
      var blob = self.getBlob();
      fileReader.readAsDataURL(blob);
    } catch (err) {
      callback(err);
    }
  }

  else if (Meteor.isServer) {
    var hasCallback = (typeof callback === 'function');
    callback = callback || defaultCallback;
    var buffer = self.getBuffer();
    if (!buffer || !self.type) {
      callback(new Error("toDataUrl requires a buffer loaded in the FS.File and a contentType"));
      return;
    }

    var data_uri_prefix = "data:" + self.type + ";base64,";
    var url = data_uri_prefix + buffer.toString("base64");
    if (hasCallback) {
      callback(null, url);
    } else {
      return url;
    }
  }
};

FS.File.prototype.isImage = function() {
  var self = this;
  if (typeof self.type !== "string") {
    return false;
  }
  return self.type.indexOf("image/") === 0;
};

FS.File.prototype.isUploaded = function() {
  var self = this;
  return self.bytesUploaded === self.size;
};

FS.File.prototype.hasMaster = function() {
  return this.hasCopy("_master");
};

/** @method FS.File.prototype.hasCopy
  * @param {string} copyName Name of the copy to check for
  * @param {boolean} optimistic In case that the file record is not found, read below
  * @returns {boolean} If the copy exists or not
  *
  * > Note: If the file is not published to the client or simply not found:
  * > this method cannot know for sure if it exists or not. The `optimistic`
  * > param is the boolean value to return. Are we `optimistic` that the copy
  * > could exist. This is the case in `FS.File.url` we are optimistic that the
  * > copy supplied by the user exists.
  */
FS.File.prototype.hasCopy = function(copyName, optimistic) {
  var self = this;
  // Make sure we use the updated file record
  self.getFileRecord();
  // If we havent the published data then
  if (typeof self.copies === 'undefined' || _.isEmpty(self.copies)) {
    return !!optimistic;
  }
  if (typeof copyName === "string") {
    return (self.copies && !_.isEmpty(self.copies[copyName]));
  }
  return false;
};

FS.File.prototype.fileIsAllowed = function() {
  var self = this;

  if (self.isMounted()) {

    var filter = self.collection.options.filter;
    if (!filter) {
      return true;
    }
    var fileSize = self.size, contentType = self.type;
    if (!contentType || !self.name || !fileSize || isNaN(fileSize)) {
      if (typeof filter.onInvalid === "function") {
        filter.onInvalid("File is missing required information");
      }
      return false;
    }
    if (typeof filter.maxSize === "number" && fileSize > filter.maxSize) {
      if (typeof filter.onInvalid === "function") {
        filter.onInvalid("File is too big");
      }
      return false;
    }
    var saveAllFileExtensions = (filter.allow.extensions.length === 0);
    var saveAllContentTypes = (filter.allow.contentTypes.length === 0);
    var ext = self.getExtension();
    if (!((saveAllFileExtensions ||
            _.indexOf(filter.allow.extensions, ext) !== -1) &&
            _.indexOf(filter.deny.extensions, ext) === -1)) {
      if (typeof filter.onInvalid === "function") {
        filter.onInvalid("Files with extension " + ext + " are not allowed");
      }
      return false;
    }
    if (!((saveAllContentTypes ||
            contentTypeInList(filter.allow.contentTypes, contentType)) &&
            !contentTypeInList(filter.deny.contentTypes, contentType))) {
      if (typeof filter.onInvalid === "function") {
        filter.onInvalid("Files of type " + contentType + " are not allowed");
      }
      return false;
    }
    return true;

  }

};

var contentTypeInList = function(list, contentType) {
  var listType, found = false;
  for (var i = 0, ln = list.length; i < ln; i++) {
    listType = list[i];
    if (listType === contentType) {
      found = true;
      break;
    }
    if (listType === "image/*" && contentType.indexOf("image/") === 0) {
      found = true;
      break;
    }
    if (listType === "audio/*" && contentType.indexOf("audio/") === 0) {
      found = true;
      break;
    }
    if (listType === "video/*" && contentType.indexOf("video/") === 0) {
      found = true;
      break;
    }
  }
  return found;
};