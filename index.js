var async = require('async'),
    path = require('path'),
    Url = require('url'),
    colors = require('colors'),
    _ = require('underscore');

/**
 * webpack编译完成后静态资源上传（CDN)
 * @param {Object} options = {
 *      receiver: {String}  上传服务地址
 *      to: {String} 上传路径
 *      data: {Object} 上传时额外的参数
 *      keepLocal: {Boolean} 是否在本地保留编译后静态资源文件，默认true
 * }
 */
function WebpackUpload (options) {
    this.wpUploadOptions = options || {};

    if (!this.wpUploadOptions.to) {
        throw new Error('options.to is required!');
    } else if (!this.wpUploadOptions.receiver) {
        throw new Error('options.receiver is required!');
    }

    this.wpUploadOptions.retry = this.wpUploadOptions.retry || 2;
    
    this.wpUploadOptions.keepLocal = true;
    if ('undefined' !== typeof options.keepLocal) {
        this.wpUploadOptions.keepLocal = !!options.keepLocal;
    }
}


WebpackUpload.prototype.apply = function (compiler) {
    var wpUploadOptions = this.wpUploadOptions;
    compiler.plugin('emit', function (compilation, callback) {

        var steps = [];
        async.forEach(Object.keys(compilation.assets), function(file, cb) {
                // 重试次数
            var reTryCount = wpUploadOptions.retry,
                // 目标文件名
                targetFile = file,
                queryStringIdx = targetFile.indexOf("?");

            // 去掉search参数
            if(queryStringIdx >= 0) {
                targetFile = targetFile.substr(0, queryStringIdx);
            }


            var outputPath = compilation.getPath(this.outputPath || compiler.outputPath),
                outputFileSystem = this.outputFileSystem || compiler.outputFileSystem,
                targetPath = outputFileSystem.join(outputPath, targetFile),
                content = compilation.assets[file].source();

            // html不上传
            if (/\.html$/.test(targetFile)) {
                return;
            }

            steps.push(function (cb) {
                var _step = arguments.callee;

                _upload(wpUploadOptions.receiver, wpUploadOptions.to, wpUploadOptions.data, content, targetPath, targetFile, function (error, re) {
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

            // 不保存编译后文件到本地
            if (!wpUploadOptions.keepLocal) {
                delete compilation.assets[file];
            }

        }.bind(this), function(err) {
            if(err) {
                console.error(err);
                return callback(err);
            }
        });

        console.log('\n--------begin upload compiled resources--------\n');
        async.series(steps, function (err, results) {
            if (err) {
                console.error(err);
                callback(err);
            }
            
            console.log('\n--------upload finish!--------\n');
            callback();
        });
    });
};


/**
 * 上传文件到远程服务
 * @param {String} receiver 上传服务地址
 * @param {String} to 上传到远程的文件目录路径
 * @param {Object} data 上传时额外参数
 * @param {String | Buffer} content 上传的文件内容
 * @param {String} filepath 上传前的文件完整路径（包含文件名）
 * @param {String} filename 上传前的文件相对（相对于webpack环境）路径（包含文件名）
 * @param {Function} callback 上传结果回调
 */
function _upload (receiver, to, data, content, filepath, filename, callback) {
    data = data || {};

    // 拼接获取远程上传的完整地址
    data['to'] = path.join(to, filename);

    // 路径兼容windows以及linux(or macos)
    data['to'] = data['to'].replace(/\\\\/g, '/').replace(/\\/g, '/');

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
 * @param  {String | Buffer}   content  上传文件的内容
 * @param  {String}   subpath  上传文件的文件名
 * @param  {Function} callback 上传后的回调
 * @name upload
 * @function
 */
function _uploadFile (url, opt, data, content, subpath, callback) {
    // utf8编码
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