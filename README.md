# webpack 远程部署（上传）插件

webpack 部署插件，可上传到远程服务器或cdn服务进行部署。

## 安装

全局安装或者本地安装:
```
npm install --save webpack-upload
```

## 使用方法

作为webpack插件进行配置
###创建插件对象方式
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

##关于接收端接口服务
receiver对应的上传接口正常响应的返回内容为: "0"，否则插件认为上传失败。

###完整配置
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
            to: '/receiver_dir/static'
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