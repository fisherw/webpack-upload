# webpack 远程部署（上传）插件

webpack 部署插件，可上传静态资源到远程服务器或cdn服务进行部署。

## 安装

全局安装或者本地安装:
```
npm install --save webpack-upload
```

## 使用方法

作为webpack插件进行配置
### 创建插件对象方式
```javascript
new WebpackUploadPlugin({
  //配置receiver，插件会把文件逐个post到接收端上
  receiver: 'http://127.0.0.1/receiver?debug=false',
  //这个参数会跟随post请求一起发送
  to: '/home/static/www',
  // to: '/Users/static/www',
  // 附加参数, 后端通过post参数形式获取
  data: {
    key1: value1,
    key2: value2
  }
};
```

## 关于接收端接口服务
1.上传为单个文件同步上传，一个文件上传响应成功则进行下一个文件上传。receiver对应的上传接口响应的状态码为200且返回内容为: "0"时表示上传成功，否则插件认为上传失败。

2.上传失败时，插件会再次尝试上传（尝试次数默认两次），若尝试上传失败，则停止上传资源。

3.上传遵从RFC文件上传规范。上传时，每次上传文件的文件名为资源生成时的文件名。

### 完整配置
```javascript
var path = require('path'),
    webpack = require('webpack'),
    WebpackUploadPlugin = require('webpack-upload');

module.exports = {
    entry: {
        'bundle': './entry.js',
    },
    output: {
        path: 'public',
        filename: '[name].js',
        chunkFilename: '[id].[hash].chunk.js',
        // cdn 地址前缀或url前缀
        publicPath: 'http://cdn.a.b.com/static/'
    },
    plugins: [
        new webpack.DefinePlugin({
            "process.env": {
                NODE_ENV: JSON.stringify(process.env.NODE_ENV)
            }
        }),
        new WebpackUploadPlugin({
            // 上传服务接口，插件会把文件逐个post到上传服务
            receiver: 'http://xx.xx.xxx/receiver',
            // 指定上传目录
            to: '/receiver_dir/static',
            // 是否在本地保留编译后静态资源文件，默认true
            keepLocal: true
        }),
        new webpack.BannerPlugin('This file is created by fisher')
    ]
};

```

## 扩展参数使用方法

如上传时需要token参数:

```javascript
// 创建token
projectToken = generateToken();

// new 插件对象
// 将token作为附加参数放入data中
new WebpackUploadPlugin({
  //如果配置了receiver，插件会把文件逐个post到接收端上
  receiver: 'http://127.0.0.1/receiver?debug=false',
  //这个参数会跟随post请求一起发送
  to: '/home/static/www',
  // to: '/Users/static/www',
  // 附加参数, 后端通过post参数形式获取
  data: {
    token: projectToken
  }
};
});
```

# 参数配置

## 调用形式：new WebpackUploadPlugin(options)

## options
Object

### options.receiver（必填）
(String)上传服务接口地址, 用于接收上传的文件资源。

### options.to (必填)
(String)上传资源时的指定文件上传路径。该参数由上传接口服务决定是否使用，若不需要，可设置为随意非空的值。

### options.keepLocal(非必填)
{Boolean} 是否在本地保留编译后静态资源文件，默认true

### options.test（非必填）
{function|RegExp} 静态资源上传过滤条件，符合过滤条件的资源才会被上传。 默认不上传html，如果配置该字段，则所有资源上传由该过滤条件来判断。 （执行过滤条件判断的参数为每个文件的全路径文件名）如：

```javascript
    // 正则表达式--只上传html
    test:  /\.html$/

    // 函数--只上传文件名包含c.js的静态资源
    test: function(filepath) {      
        return filepath.indexOf('c.js') > -1;
    }

```

### options.data（非必填）
(Object)上传资源时附带参数(post参数)，可用于上传时的一些校验或其它处理参数的传递。

