var async = require('async'),
    path = require('path'),
    Url = require('url'),
    colors = require('colors'),
    _ = require('underscore');

function WebpackUpload (options) {
    this.wpUploadOptions = options || {};

    if (!this.wpUploadOptions.to) {
        throw new Error('options.to is required!');
    } else if (!this.wpUploadOptions.receiver) {
        throw new Error('options.receiver is required!');
    }

    this.wpUploadOptions.retry = this.wpUploadOptions.retry || 2;
}


WebpackUpload.prototype.apply = function (compiler) {
    var wpUploadOptions = this.wpUploadOptions;
    compiler.plugin('after-emit', function (compilation, callback) {

        var steps = [];
        async.forEach(Object.keys(compilation.assets), function(file, cb) {
            var reTryCount = wpUploadOptions.retry,
                receiver = wpUploadOptions.receiver,
                to = wpUploadOptions.to,
                data = wpUploadOptions.data || {},
                targetFile = file,
                queryStringIdx = targetFile.indexOf("?");

            if(queryStringIdx >= 0) {
                targetFile = targetFile.substr(0, queryStringIdx);
            }

            var outputPath = compilation.getPath(this.outputPath),
                targetPath = this.outputFileSystem.join(outputPath, targetFile),
                source = compilation.assets[file],
                content = source.source();

            steps.push(function (cb) {
                var _step = arguments.callee;

                _upload(receiver, to, data, content, targetPath, targetFile, function (error, re) {
                   if (error) {
                       if (wpUploadOptions.retry && !--reTryCount) {
                           throw new Error(error);
                       } else {
                           console.log('[retry uploading file] ' + targetPath);
                           _step();
                       }
                   } else {
                       cb(null, re);
                   }
                });
            });

        }.bind(this), function(err) {
            if(err) {
                console.error(err);
                return callback(err);
            }
        }.bind(this));

        console.log('--------begin upload compiled source--------');
        async.series(steps, function (err, results) {
            if (err) {
                console.error(err);
                callback(err);
            }
            
            console.log('upload finish!');
            callback();
            
        });
    });
};


/**
 * 上传文件到远程服务
 * @param filePath
 * @param fileName
 */
function _upload (receiver, to, data, content, filepath, filename, callback) {
    data['to'] = path.resolve(to, filename);

    _uploadFile(
        //url, request options, post data, file
        receiver, null, data, content, filename,
        function(err, res) {
            if (err || res.trim() != '0') {
                callback('upload file [' + filepath + '] to [' + data['to'] + '] by receiver [' + receiver + '] error [' + (err || res) + ']');
            } else {
                var time = '[' + _now(true) + ']';
                process.stdout.write(
                    ' - '.green.bold +
                    time.grey + ' ' +
                    filepath.replace(/^\//, '') +
                    ' >> '.yellow.bold +
                    data['to'] +
                    '\n'
                );
                callback();
            }
        }
    );
};

/**
 * 遵从RFC规范的文件上传功能实现
 * @param  {String}   url      上传的url
 * @param  {Object}   opt      配置
 * @param  {Object}   data     要上传的formdata，可传null
 * @param  {String}   content  上传文件的内容
 * @param  {String}   subpath  上传文件的文件名
 * @param  {Function} callback 上传后的回调
 * @name upload
 * @function
 */
function _uploadFile (url, opt, data, content, subpath, callback) {
    if (typeof content === 'string') {
        content = new Buffer(content, 'utf8');
    } else if (!(content instanceof Buffer)) {
        console.error('unable to upload content [%s]', (typeof content));
    }
    opt = opt || {};
    data = data || {};
    var endl = '\r\n';
    var boundary = '-----np' + Math.random();
    var collect = [];
    _map(data, function(key, value) {
        collect.push('--' + boundary + endl);
        collect.push('Content-Disposition: form-data; name="' + key + '"' + endl);
        collect.push(endl);
        collect.push(value + endl);
    });
    collect.push('--' + boundary + endl);
    collect.push('Content-Disposition: form-data; name="' + (opt.uploadField || "file") + '"; filename="' + subpath + '"' + endl);
    collect.push(endl);
    collect.push(content);
    collect.push(endl);
    collect.push('--' + boundary + '--' + endl);
    var length = 0;
    collect.forEach(function(ele) {
        if (typeof ele === 'string') {
            length += new Buffer(ele).length;
        } else {
            length += ele.length;
        }
    });
    opt.method = opt.method || 'POST';
    opt.headers = _.extend({
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': length
    }, opt.headers || {});
    opt = _parseUrl(url, opt);
    var http = opt.protocol === 'https:' ? require('https') : require('http');
    var req = http.request(opt, function(res) {
        var status = res.statusCode;
        var body = '';
        res
            .on('data', function(chunk) {
                body += chunk;
            })
            .on('end', function() {
                if (status >= 200 && status < 300 || status === 304) {
                    callback(null, body);
                } else {
                    callback(status);
                }
            })
            .on('error', function(err) {
                callback(err.message || err);
            });
    });
    collect.forEach(function(d) {
        req.write(d);
    });
    req.end();
}


/**
 * 获取当前时间
 * @param  {Boolean} withoutMilliseconds 是否不显示豪秒
 * @return {String}                     HH:MM:SS.ms
 * @name now
 * @function
 */
function _now (withoutMilliseconds) {
    var d = new Date(),
        str;

    str = [
        d.getHours(),
        d.getMinutes(),
        d.getSeconds()
    ].join(':').replace(/\b\d\b/g, '0$&');
    if (!withoutMilliseconds) {
        str += '.' + ('00' + d.getMilliseconds()).substr(-3);
    }
    return str;
}


/**
 * 对象枚举元素遍历，若merge为true则进行_.assign(obj, callback)，若为false则回调元素的key value index
 * @param  {Object}   obj      源对象
 * @param  {Function|Object} callback 回调函数|目标对象
 * @param  {Boolean}   merge    是否为对象赋值模式
 * @name map
 * @function
 */
function _map(obj, callback, merge) {
    var index = 0;
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            if (merge) {
                callback[key] = obj[key];
            } else if (callback(key, obj[key], index++)) {
                break;
            }
        }
    }
}


/**
 * url解析函数，规则类似require('url').parse
 * @param  {String} url 待解析的url
 * @param  {Object} opt 解析配置参数 { host|hostname, port, path, method, agent }
 * @return {Object}     { protocol, host, port, path, method, agent }
 * @name parseUrl
 * @function
 */
function _parseUrl (url, opt) {
    opt = opt || {};
    url = Url.parse(url);
    var ssl = url.protocol === 'https:';
    opt.host = opt.host || opt.hostname || ((ssl || url.protocol === 'http:') ? url.hostname : 'localhost');
    opt.port = opt.port || (url.port || (ssl ? 443 : 80));
    opt.path = opt.path || (url.pathname + (url.search ? url.search : ''));
    opt.method = opt.method || 'GET';
    opt.agent = opt.agent || false;
    return opt;
}


module.exports = WebpackUpload;