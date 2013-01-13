var GFSBrowser = {
    templates: {},
    views: {},
    init: function(callback) {
        // hardcoded for now
        $.get(PlayRouter.controllers.Application.database("app").url, function(result) {
            var stores = {
                stores: result
            }
            console.log(result)
            var html = GFSBrowser.templates.stores(stores)
            $('ul.list', GFSBrowser.views.$stores).remove()
            GFSBrowser.views.$stores.append(html)
            if(result.length > 0)
                GFSBrowser.switchStore(result[0])
            callback && callback()
        })

        Handlebars.registerHelper('eachKV', function(items, options) {
            var out = "";

            for(var i in items) {
                //console.log('\t' + i + '=' + items[i])
                out += options.fn({name: i, value: items[i]})
            }

            return out;
        });

        Handlebars.registerHelper('capitalize', function(value) {
            if(typeof value === 'string')
                return value.charAt(0).toUpperCase() + value.slice(1)
        });

        Handlebars.registerHelper('show', function(item) {
            if(item && item['$oid']) // objectid
                return item['$oid']
            if(item && item['$date']) {
                var date = new Date(item['$date'])
                return date.toLocaleDateString() + " " + date.toLocaleTimeString()
            }
            return item
        });

        Handlebars.registerHelper('list', function(context, options) {
          var out = "", data = {};

          for (var i=0; i<context.length; i++) {
            if (options.data) { data = Handlebars.createFrame(options.data); }
            data.index = i
            out += options.fn(context[i], { data: data });
          }

          return out;
        });

        Handlebars.registerHelper('ifEq', function(v1, v2, options) {
          if(v1 == v2) {
            return options.fn(this);
          }
          return options.inverse(this);
        });

        this.templates.stores = Handlebars.compile($("#tmpl-stores").html())
        this.templates.files = Handlebars.compile($("#tmpl-files").html())
        this.templates.file = Handlebars.compile($("#tmpl-file").html())
        this.templates.fileUpdate = Handlebars.compile($("#tmpl-file-update").html())
        this.templates.newmetadata = Handlebars.compile($("#tmpl-file-update-newmetadata").html())

        this.views.$stores = $('#stores')
        this.views.$files = $('#files')
        this.views.$file = $('#file')
    },
    switchStore: function(store) {
        $.get(PlayRouter.controllers.Application.listFiles("app", store.store, 0).url, function(files) {
            GFSBrowser.store = new Store(store.store, files, store.size)
        })
    },
    next: function() {
        var pagination = GFSBrowser.store.pagination
        var offset = pagination.offset + pagination.pageSize
        $.get(PlayRouter.controllers.Application.listFiles("app", GFSBrowser.store.name, offset).url, function(files) {
            GFSBrowser.store = new Store(GFSBrowser.store.name, files, GFSBrowser.store.pagination.size, offset, pagination.pageSize)
        })
    },
    previous: function() {
        var pagination = GFSBrowser.store.pagination
        var offset = pagination.offset - pagination.pageSize
        offset = offset > 0 ? offset : 0
        $.get(PlayRouter.controllers.Application.listFiles("app", GFSBrowser.store.name, offset).url, function(files) {
            GFSBrowser.store = new Store(GFSBrowser.store.name, files, GFSBrowser.store.pagination.size, offset, pagination.pageSize)
        })
    }
}

function Store(_name, _files, _size, _offset, _pageSize) {
    var that = this

    this.name = _name
    
    this.pagination = {
        size: _size,
        offset: _offset || 0,
        pageSize: _pageSize || 3,
        hasNext: function() {
            console.log(this.size, this.offset, this.size - this.offset > 0)
            return this.size - this.offset - this.pageSize > 0
        },
        hasPrevious: function() {
            return this.offset > 0
        }
    }

    this._processed = $.map(_files, function(file) {
        return that.process(file)
    })

    this.get = function(i) {
        return this._processed[i]
    }

    this.update = function(i, file) {
        this._processed[i] = this.process(file)
        this.render()
        this.renderFile(i)
        return this._processed[i]
    }

    this.add = function(file) {
        var processed = this.process(file)
        this._processed.push(processed)
        this.render()
        this.renderFile(this._processed.length - 1)
        return processed
    }

    this.render = function() {
        var data = {
            hasNext: this.pagination.hasNext(),
            hasPrevious: this.pagination.hasPrevious(),
            files: $.map(this._processed, function(v, i) {
                return {
                    formatted: v.formatted,
                    fileEntry: i,
                    fileNumber: i + that.pagination.offset
                }
            })
        }
        var html = GFSBrowser.templates.files(data)
        //console.log($('ul.list', $files))
        $('#fileList', GFSBrowser.views.$files).remove()
        var $list = $(html)
        $list.find('li:not(.next):not(.previous)').click(function() {
            console.log('clicked ', this)
            var id = this.id.replace('file-entry-', '')
            console.log(id)
            $list.find('li').removeClass('selected')
            $(this).addClass('selected')
            GFSBrowser.store.renderFile(id)
        })
        $list.find('.next').click(function() {
            GFSBrowser.next()
            return false
        })
        $list.find('.previous').click(function() {
            GFSBrowser.previous()
            return false
        })
        GFSBrowser.views.$files.append($list)
    }

    this.renderFile = function(i, message) {
        var file = this.get(i)
        if(!file)
            return;
        //console.log(file.formatted)
        var url = PlayRouter.controllers.Application.update('app', this.name, file.formatted._id).url
        var html = GFSBrowser.templates.fileUpdate({
            file: file,
            url: url,
            message: message
        }, undefined, 2)
        //console.log(html)
        $('div, form', GFSBrowser.views.$file).remove()
        var $form = $(html)
        GFSBrowser.views.$file.append($form)

        // events
        $form.submit(function() {
            var newmetadata = []
            //var array = $(this).serializeArray()
            var array = $.map($(this).serializeArray(), function(e) {
                if(e.name.indexOf('newmetadata-name-') == 0) {
                    var index = parseInt(e.name.substring('newmetadata-name-'.length))
                    newmetadata[index] = newmetadata[index] || {}
                    newmetadata[index].name = e.value
                } else if(e.name.indexOf('newmetadata-value-') == 0) {
                    var index = parseInt(e.name.substring('newmetadata-value-'.length))
                    newmetadata[index] = newmetadata[index] || {}
                    newmetadata[index].value = e.value
                } else return e;
            }).concat(newmetadata)

            console.log(array)

            var json = {
                $set: {},
                $unset: []
            }
            $.each(array, function(i, e) {
                //console.log(e)
                if(e && e.name && e.name.trim()) {
                    console.log(e.name)
                    json.$set[e.name] = e.value
                }
            })

            $('.toRemove', this).each(function() {
                json.$unset.push($(this).val())
            })
            console.log(json, JSON.stringify(json))

            //return false
            $.ajax({
                url: url,
                type: 'post',
                data: JSON.stringify(json),
                success: function(file) {
                    console.log('success! ', file)
                    that.update(i, file)
                    that.render()
                    that.renderFile(i, "Successfully updated!")
                },
                contentType: 'application/json'
            })
            return false
        })

        $('.addMetadata', $form).click(function() {
            $(this).parent().find('.field:not(.submit):last').eq(0)
            var count = $(this).parent().find('.newmetadata').length
            $(this).parent().find('.field:not(.submit):last').eq(0).after(
            GFSBrowser.templates.newmetadata({i: count}))
        })

        $('.removeMetadata', $form).click(function() {
            var name = $(this).parent().find('label').text()
            if(!name)
                name = $(this).parent().find('label input').val()

            console.log('remove ', name)
            $form.append($('<input type="hidden" disabled="disabled" class="toRemove">').val(name))
            $(this).parent().remove()
            return false
        })
    }

    that.render()
    that.renderFile(0)
}

Store.prototype.process = function(file) {
    var formatted = jQuery.extend(true, {}, file);
    console.log('FILE', formatted)
    GridFSBrowser.utils.format(formatted)
    if(formatted.length)
        formatted.length = GridFSBrowser.utils.formatStorageUnit(formatted.length)
    if(formatted.chunkSize)
        formatted.chunkSize = GridFSBrowser.utils.formatStorageUnit(formatted.chunkSize)
    console.log('formatted', formatted)

    var editable = {}
    var readonly = {}

    for(var name in file) {
        if(name == '_id' || name == 'chunkSize' || name == 'length' || name == 'md5' || name == 'uploadDate')
            readonly[name] = file[name]
        else editable[name] = file[name]
    }

    console.log('editable', editable)

    var preview;

    if(editable.contentType && editable.contentType.indexOf('image/') === 0)
        preview = PlayRouter.controllers.Application.getFile('app', this.name, formatted._id).url

    return {
        formatted: formatted,
        editable: editable,
        readonly: readonly,
        preview: preview
    }
}


var GridFSBrowser = {
    shownFiles: [],
    updatable: function(i) {
        return {
            file: function() {
                return GridFSBrowser.shownFiles[i]
            },
            update: function(file) {
                GridFSBrowser.shownFiles[i] = file
                return this
            }
        }
    }
}

GridFSBrowser.utils = {
    formatStorageUnit: (function() {
        var kB = 1024
        var MB = 1024 * kB
        var GB = 1024 * MB
        return function(bytes) {
            if(bytes > GB)
                return Math.round(bytes / GB) + " GB"
            if(bytes > MB)
                return Math.round(bytes / MB) + " MB"
            if(bytes > kB)
                return Math.round(bytes / kB) + " kB"
            return bytes + " b"
        }
    })(),
    format: function(obj) {
        for(var i in obj) {
            var item = obj[i]
            console.log(i, item)
            if(typeof item === 'object') {
                if(item && item['$oid']) // objectid
                    obj[i] = item['$oid']
                else if(item && item['$date']) {
                    var date = new Date(item['$date'])
                    obj[i] = date.toLocaleDateString() + " " + date.toLocaleTimeString()
                }
                else obj[i] = GridFSBrowser.utils.format(item)
            }
        }
        return obj
    },
    processFile: function(val) {
        console.log('THIS', this)
        var file = jQuery.extend(true, {}, val);
        console.log('FILE', file)
        GridFSBrowser.utils.format(file)
        if(file.length)
            file.length = GridFSBrowser.utils.formatStorageUnit(file.length)
        if(file.chunkSize)
            file.chunkSize = GridFSBrowser.utils.formatStorageUnit(file.chunkSize)
        console.log(file)

        var editable = {}
        var readonly = {}

        for(var name in val) {
            if(name == 'chunkSize' || name == 'length' || name == 'md5' || name == 'uploadDate')
                readonly[name] = val[name]
            else editable[name] = val[name]
        }

        console.log('editable', editable)

        return {
            formatted: file,
            editable: editable,
            readonly: readonly
        }
    }
}




$(function() {
    GFSBrowser.init()

    var dropZoneElement = document.getElementById("dropZone");

    console.log(dropZoneElement)

    if(!dropZoneElement)
        return false;

    dropZoneElement.addEventListener('dragleave', onDragLeave, false);
    dropZoneElement.addEventListener('dragenter', onDragEnter, false);
    dropZoneElement.addEventListener('dragover', onDragOver, false);
    dropZoneElement.addEventListener('drop', function(_e) {
        _e.preventDefault();
        _e.stopPropagation();
        var files = event.dataTransfer.files
        alert("hop")
        for (var i = 0; i < files.length; i++) {
            var reader = new FileReader();
            reader.onload = (function(file) {
                return function (evt) {
                    console.log("coucou")

                    var url = PlayRouter.controllers.Application.add('app', GFSBrowser.store.name).url
                    uploadFile(file, url, function(uploaded) {

                        console.log('UPLOADED', uploaded, typeof uploaded)
                        uploaded = JSON.parse(uploaded)
                        GFSBrowser.store.add(uploaded)
                    })
                    /*var img = document.createElement("img");
                    $(img).load(function() {
                        uploadFile(file, putImageURL(), (function(img) {
                            return function(id) {
                                resize(img, id, file.name)
                            }
                        })(img))
                    }).attr('src', evt.target.result);*/
                }
            })(files[i]);
            reader.readAsDataURL(files[i])
        }
    }, false);

    function uploadFile(file, url, callback, preview) {
        var formData = new FormData();
        formData.append('file', file);
        var xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress",  onUploadProgress, false);
        xhr.open("PUT", url, true);

        xhr.onreadystatechange = function(e) {
            if (xhr.readyState == xhr.DONE && xhr.status == 200) {
                if(typeof callback === 'function')
                    callback(xhr.response)
            }
        };

        xhr.upload.addEventListener("load",  function(e) {
            //console.log("load", e)
            //console.log(xhr)
        }, false);

        xhr.send(formData);
    }

    function onUploadProgress(event) {
        if (event.lengthComputable) {
            // yourProgressBar.style.width = (event.loaded / event.total) * 100 + "%";
            //console.log((event.loaded / event.total) * 100 + "%")
        }
    }


    function onDragLeave(event) {
        event.preventDefault();
        event.stopPropagation();
        $(dropZoneElement).removeClass('hover')
    }

    function onDragEnter(event) {
        event.preventDefault();
        event.stopPropagation();
        $(dropZoneElement).addClass('hover')
    }

    function onDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.dropEffect = "copy";
    }

    function onDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        onFilesSelected(event.dataTransfer.files);
    }

})

