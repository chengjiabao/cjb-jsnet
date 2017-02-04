'use strict'

// 网络模块
const net = require('net')
// tls 加密模块
const tls = require('tls')

const fs = require('fs')
const util = require('ddv-worker/util')

// child_process模块
const fork = require('child_process').fork
const master = require('ddv-worker')

  // 默认站点id
let defaultListenSiteId = null

  // 最后的workerId
var workerIdLast = 0

  // 系统内部配置
const sys = master.__sys_private__ = master.__sys_private__ || Object.create(null)

  // 创建存储进程配置信息的对象
const listenToSiteId = sys.listenToSiteId = sys.listenToSiteId || Object.create(null)

  // 监听列表
const listenLists = sys.listenLists = sys.listenLists || Object.create(null)

  // 站点id 转 配置信息
const siteIdToServerConfig = sys.siteIdToServerConfig = sys.siteIdToServerConfig || Object.create(null)

  // 站点id 转 WIDS
const siteIdToWorkerInfo = sys.siteIdToWorkerInfo = sys.siteIdToWorkerInfo || Object.create(null)

  // 服务器workerid转serverid
const workerIdToSiteId = sys.workerIdToSiteId = sys.workerIdToSiteId || Object.create(null)

  // 服务器workerid转pid
const workerIdToPId = sys.workerIdToPId = sys.workerIdToPId || Object.create(null)

  // 所以的子进程对象
const workers = master.workers = master.workers || Object.create(null)

  // 所以的子进程id结合数组
const workerIds = master.workerIds = []

  // 服务器运行池
const servers = master.servers || Object.create(null)

  // 启动监听服务
sys.serverListenInit = function () {
  if (sys.isServerListenInit === true) {
    return
  }
  sys.isServerListenInit = true

  console.log('开启代理监听')

  sys.serverProxyListen()

  console.log('等待站点加入')
}

  /**
   * [loadSite 加载站点，如果站点是已经启动的会判断是否已经变化数据]
   * @author: 桦 <yuchonghua@163.com>
   * @DateTime 2016-11-14T23:48:03+0800
   * @param    {[type]}                 options    [description]
   * @param    {[type]}                 siteConfig [description]
   */
master.loadSite = function (options) {
  console.log('载入站点 siteId:', options.siteId)

  sys.loadSite(options)
}

  /**
   * [serverAllClose 关闭所有服务]
   * @author: 桦 <yuchonghua@163.com>
   * @DateTime 2016-11-14T23:16:51+0800
   * @return   {[type]}                 [description]
   */
master.serverAllClose = function () {
  util.each((servers || {}), function (key, server) {
    if (Object.hasOwnProperty.call(servers, key)) {
      return
    }
    try {
      if (util.isFunction(server.close)) {
        server.close()
      }
    } catch (e) {}
  })
}

  /**
   * [loadSite 添加站点]
   * @author: 桦 <yuchonghua@163.com>
   * @DateTime 2016-11-15T00:23:54+0800
   * @param    {[type]}                 options    [description]
   */
sys.loadSite = function (options) {
  if (!(options && options.siteId)) {
    console.log('没有传入参数', options.siteId)

    return
  }
  options.listen = options.listen || []

  options.defaultListen = Boolean(options.defaultListen)

  sys.loadSiteRun(options)
}

sys.loadSiteRun = function (options) {
  sys.loadSiteListsAndReload(options)

    // 重新补充启动线程
  sys.forkReload()

    // 监听
  sys.serverListenReload()
}

sys.sotpSite = function (siteId) {
  console.log('sotpSite siteId', siteId)
}

sys.loadSiteListsAndReload = function (options) {
    // 判断是否需要启动虚拟主机模式
    // 计算进程数
  let [listenToSiteIdT, listenListsT, siteIdToWorkerInfoT] = [Object.create(null), Object.create(null), Object.create(null)]

    // 获取默认id
  defaultListenSiteId = defaultListenSiteId || null

    // 加入配置
  siteIdToServerConfig[options.siteId] = options

    // 遍历服务器列表
  util.each(siteIdToServerConfig, function (siteId, options) {
      // 设定第一个为默认
    if ((!defaultListenSiteId) || (!siteIdToServerConfig[defaultListenSiteId])) {
      defaultListenSiteId = siteId
    }
      // 修改默认站点
    if (options.defaultListen) {
      defaultListenSiteId = siteId
    }
    util.each(options.listen, function (listenId, listen) {
        // 默认type为tcp协议
      listen.type = listen.type || 'tcp'
        // 端口
      if (listen.type === 'tcp') {
        listen.port = listen.port || '80'
      } else {
        listen.port = listen.port || '443'
      }

      var key, host

      if (['tcp', 'ssl'].indexOf(listen.type) > -1) {
        key = listen.type + ':' + listen.port
        key += ':' + (listen.ipaddress = listen.ipaddress || '')

        listen.typePortIp = key

        host = (listen.host = listen.host || '')

        listenToSiteIdT[key] = listenToSiteIdT[key] || Object.create(null)

        listenToSiteIdT[key][host] = siteId

        listenListsT[key] = listen
      }
      key = host = listenId = listen = void 0
    })
    siteId = options = void 0
  })

  util.each(siteIdToServerConfig, (siteId, options) => {
    options.cpuLen = parseInt(options.cpuLen) || 1 || (master.cpuLen / siteIdToServerConfig.length)

    siteIdToWorkerInfoT[siteId] = Object.create(null)

    siteIdToWorkerInfoT[siteId].cpuLen = options.cpuLen

    siteIdToWorkerInfoT[siteId].wids = siteIdToWorkerInfo[siteId] && siteIdToWorkerInfo[siteId].wids || []
  })

    // 删除原来不存在的
  util.each(listenToSiteId, (key) => {
    if (!listenToSiteIdT[key]) {
      delete listenToSiteId[key]
    }
  })

    // 插入新的
  util.each(listenToSiteIdT, (key) => {
    listenToSiteId[key] = listenToSiteIdT[key]
  })

    // 删除原来不存在的
  util.each(listenLists, (key) => {
    if (!listenListsT[key]) {
      if (servers[key] && servers[key].close) {
        try {
            // 停止不在监听列表的服务
          servers[key].close()
        } catch (e) {}
      }
      console.log('停止监听服务' + key)

      delete listenLists[key]
    }
  })

    // 插入新的
  util.each(listenListsT, (key) => {
    listenLists[key] = listenListsT[key]
  })

    // 删除原来不存在的
  util.each(siteIdToWorkerInfo, (key) => {
    if (!siteIdToWorkerInfoT[key]) {
      console.log('停止worker代码')

      delete siteIdToWorkerInfo[key]
    }
  })

    // 插入新的
  util.each(siteIdToWorkerInfoT, (key) => {
    siteIdToWorkerInfo[key] = siteIdToWorkerInfoT[key]
  })
}

  /**
   * [sys.runFork 启动子进程]
   */
sys.forkReload = function () {
  let args = []

    // 有颜色
  if (args.indexOf('--color') < 0) {
    args.push('--color')
  }
    // 回收内存
  if (args.indexOf('--expose-gc') < 0) {
    args.push('--expose-gc')
  }

  workerIdLast = workerIdLast || 0

    // 循环启动
  util.each(siteIdToWorkerInfo, function (siteId, widsInfo) {
    while (((widsInfo.cpuLen - widsInfo.wids.length) || 0) >= 1) {
      let options = siteIdToServerConfig[siteId]

        // 虚拟主机模式[需要消耗资源来判断域名绑定]
        // 生成 workerId
      let workerId = (++workerIdLast).toString()

        // 构造参数
        // let npmRunoptions = {
        //   silent : true,
        //   cwd: options.workerFile,
        //   env: util.extend(true, {}, process.env, {
        //     PWD:options.workerFile,
        //     DDV_WORKER_PROCESS_TYPE:'worker',
        //     DDV_WORKER_PROCESS_WORKER_ID:workerId
        //   })
        // }

      util.extend(true, options.workerOptions, {
        silent: true,
        env: {
          // process type
          DDV_WORKER_PROCESS_TYPE: 'worker',
          // process worker id
          DDV_WORKER_PROCESS_WORKER_ID: workerId,
          // process site id
          DDV_WORKER_PROCESS_SITE_ID: siteId,
          // server guid
          DDV_WORKER_SERVER_GUID: util.getServerGuid(process.env.DDV_WORKER_SERVER_GUID)
        }
      })

      // 启动子进程
      let worker = fork(options.workerFile, options.workerArgs, options.workerOptions)

      // 加入子进程id
      worker.id = workerId

      worker.stdout.on('data', sys._log.onStdoutData.bind(worker))

      worker.stderr.on('data', sys._log.onStderrData.bind(worker))

      worker.logPath = Object.create(null)

      worker.logPath.output = options.logOutput

      worker.logPath.error = options.logError

      worker.logPath.all = options.logAll

        // 获取指针
      sys._log.getFd(worker.logPath.output)

      sys._log.getFd(worker.logPath.error)

      sys._log.getFd(worker.logPath.all)

        // wids
      widsInfo.wids = widsInfo.wids || []

      widsInfo.wids.push(worker.id)

      workerIdToSiteId[worker.id] = siteId

      workerIdToPId[worker.id] = worker.pid

        // 绑定事件
      sys.workerEventBind(worker)

        // 插入数组中缓存起来
      workerIds.push(worker.id)

      workers[worker.id] = worker
    }
  })

  args = void 0
}

sys.serverListenReload = function () {
  util.each(listenLists, function (typePortIp, info) {
    if (servers[typePortIp]) {
      return
    }
    var server
    if (info.type === 'ssl') {
      server = tls.createServer(sys.getSslOptions(info))
    } else {
      server = net.createServer()
    }

    servers[typePortIp] = server

    server.listenInfo = info

    server.listen_time = master.now()

    typePortIp = info = void 0

    server.listenArgs = []

    server.listenArgs.push(server.listenInfo.port)

    if (server.listenInfo.ipaddress) {
      server.listenArgs.push(server.listenInfo.ipaddress)
    }
    sys.serverBind(server)

    server.listen.apply(server, server.listenArgs)

    server = void 0
  })
}

  /**
   * [serverProxyListen 监听代理服务器]
   * @author: 桦 <yuchonghua@163.com>
   * @DateTime 2016-11-14T23:13:12+0800
   * @return   {[type]}                 [description]
   */
sys.serverProxyListen = function (callback) {
  let server = net.createServer()

  new Promise((resolve, reject) => {
      // 创建服务
    server.listenInfo = {
      serverProxy: true,
      typePortIp: 'serverProxy'
    }

      // 绑定服务
    try {
      sys.serverBind(server)

      resolve()
    } catch (e) {
      reject(e)
    }
  }).then(() => {
      // 判断是否定义了管道
    if (!master._serverProxyListenPort) {
      if (process.platform === 'win32' || process.platform === 'win64') {
        master._serverProxyListenPort = '\\\\.\\pipe\\cjbjsnet.master.server.proxy.port.sock'
      } else {
        let os = require('os')

        master._serverProxyListenPort = os.tmpdir() + os.EOL + 'cjbjsnet.master.server.proxy.port.sock'
      }
    }
  }).then(() => {
    return new Promise((resolve, reject) => {
        //  如果存在管道通讯文件则删除
      try {
        let stat = fs.statSync(master._serverProxyListenPort)

        switch (true) {
          case stat.isFile():
          case stat.isDirectory():
          case stat.isBlockDevice():
          case stat.isCharacterDevice():
          case stat.isSymbolicLink():
          case stat.isFIFO():
          case stat.isSocket():
            fs.unlink(master._serverProxyListenPort, (e) => {
              return e ? reject(e) : resolve()
            })
            break
          default:
            resolve()
            break
        }
      } catch (e) {
        resolve()
      }
    })
  }).then(() => {
    return new Promise((resolve, reject) => {
        // 修改管道权限
      fs.access(master._serverProxyListenPort, fs.constants.F_OK | fs.constants.R_OK | fs.constants.W_OK, (e) => {
        return e ? reject(e) : resolve()
      })
    })
  }).then(() => {
    return new Promise((resolve, reject) => {
        // 赋予管道权限
      fs.chmod(master._serverProxyListenPort, 0o666, (e) => {
        return e ? reject(e) : resolve()
      })
    })
  }).then(() => {
    if (util.isFunction(callback)) {
      callback(null)
    }
    callback = void 0
  }).catch((e) => {
    if (util.isFunction(e)) {
      callback(e, null)
    }
    callback = e = void 0
  })
}

  /**
   * [serverBind 绑定服务]
   * @author: 桦 <yuchonghua@163.com>
   * @DateTime 2016-11-14T23:10:01+0800
   * @param    {[type]}                 server [description]
   * @return   {[type]}                        [description]
   */
sys.serverBind = function (server) {
    // 监听
  server.on('listening', function onListenCallback () {
    master.emit('server::listening', this.listenInfo)
  })

    // 错误
  server.on('error', function (e) {
    let args = util.argsToArray(arguments)

    args.unshift('server::error')

    if (!master.emit.apply(master, args)) {
      args[0] = 'error'
    }
    args = e = void 0
  })

  if (server.listenInfo && server.listenInfo.type === 'ssl') {
      /*
      server.on('tlsClientError',function(e){
        var args = util.argsToArray(arguments)

          args.unshift('server::error')

          master.emit.apply(master, args)

          args = e = undefined

      })

      */
  }

    // 关闭
  server.on('close', function onCloseCallback () {
      // 回收
    if (this &&
        this.listen_time &&
        this.listenInfo &&
        this.listenInfo.typePortIp) {
      delete servers[this.listenInfo.typePortIp]
    }
    master.emit('server::close', this.listenInfo)
  })

    // 连接部分
  if (server.listenInfo && server.listenInfo.type === 'ssl') {
    server.on('secureConnection', function connectionCb (socket) {
      var listenInfo = util.extend(true, { listen: socket.address() }, this.listenInfo)

      socket.pause()

      socket.serverProxy = net.connect(master._serverProxyListenPort)

      socket.listenInfoJson = new Buffer((JSON.stringify(listenInfo) + '\r\n\r\n'), 'utf-8')

      listenInfo = undefined

      socket.serverProxy.on('connect', function connect () {
        var isDataEnd = ''

        socket.serverProxy.write(socket.listenInfoJson)

        socket.serverProxy._sysOnData = function data (data) {
          isDataEnd += data.toString()

          if (isDataEnd === 'listenInfo_end') {
            socket.serverProxy.pause()

            socket.serverProxy.removeListener('data', socket.serverProxy._sysOnData)

            delete socket.serverProxy._sysOnData

            socket.pipe(socket.serverProxy).pipe(socket)

            socket.serverProxy.resume()

            socket.resume()
          }
        }

        socket.serverProxy.on('data', socket.serverProxy._sysOnData)

        socket.serverProxy.on('error', function () {
          console.error('内部错误')
        })

        socket.on('error', function () {
          console.error('内部错误')
        })
      })

        // sys.newSocket(socket, this.listenInfo.typePortIp, this.listenInfo)

        // socket = undefined
    })
  } else if (server.listenInfo && server.listenInfo.type === 'tcp') {
    server.on('connection', function connectionCb (socket) {
      var listenInfo = util.extend(true, { listen: socket.address() }, this.listenInfo)

      sys.newSocket(socket, this.listenInfo.typePortIp, listenInfo)

      socket = undefined
    })
  } else if (server.listenInfo && server.listenInfo.serverProxy) {
    server.on('connection', function connectionCb (socket) {
      sys.newSocket(socket, this.listenInfo.typePortIp, this.listenInfo)
      socket = undefined
    })
  } else {
  }
  server = void 0
}

  /**
   * [getSslOptions 获取ssl的秘钥]
   * @author: 桦 <yuchonghua@163.com>
   * @DateTime 2016-11-14T22:06:05+0800
   * @param    {[type]}                 options [description]
   * @return   {[type]}                         [description]
   */
sys.getSslOptions = function (options) {
  return {
      // key
    'key': fs.readFileSync(options.key),
      // 证书
    'cert': fs.readFileSync(options.cert),
      // 秘钥
    'passphrase': options.passphrase
  }
}

sys.virtuaHostServerErrorEcho = function (socket, text, status) {
  try {
    status = status || '501 Not Implemented'

    socket.write('HTTP/1.1 ' + status + '\r\n')

    socket.write('Date: ' + (new Date()).toGMTString() + '\r\n')

    socket.write('Server: Ddv/1.3.11 BSafe-SSL/1.38 (Unix) FrontPage/4.0.4.3\r\n')

    socket.write('Last-Modified: ' + (new Date()).toGMTString() + '\r\n')

    socket.write('Connection: close\r\nContent-Type: text/html')

    socket.write('\r\n\r\n' + (text || status))

    socket.end()
  } catch (e) {}
}

  /**
   * [sendSocketToWorker 转发子进程处理]
   * @author: 桦 <yuchonghua@163.com>
   * @DateTime 2016-11-14T23:08:56+0800
   * @param    {[type]}                 headers         [description]
   * @param    {[type]}                 typePortIp    [description]
   * @param    {[type]}                 listenInfo     [description]
   * @param    {[type]}                 socket          [description]
   * @param    {[type]}                 bufferByBodyEnd [description]
   * @return   {[type]}                                 [description]
   */
sys.sendSocketToWorker = function sendSocketToWorker (headers, typePortIp, listenInfo, socket, bufferByBodyEnd) {
  var hostLower = null
  var hostSource = null
  var workerId = null
  var worker = null
  var widsInfo = null
  var wids = null
  var siteId = false

    // 精确匹配 type port ip host 模式
  if (typePortIp && listenToSiteId[typePortIp]) {
    hostSource = headers.host

    hostLower = hostSource.toLowerCase()

    util.each(listenToSiteId[typePortIp], function (hostI, siteIdI) {
      if (hostSource === hostI || hostLower === hostI.toLowerCase()) {
        siteId = siteIdI === undefined ? false : siteIdI
      }
    })

    if (siteId === false) {
        // type port ip 模式匹配
      siteId = listenToSiteId[typePortIp]['']

      if (siteId === undefined || siteId === null) {
        siteId = false
        // 判断ip是否匹配
      } else if (listenInfo.listen.address !== listenInfo.ipaddress && listenInfo.ipaddress !== '') {
        siteId = false
      }
    }
  }
    // 默认站点
  if (siteId === false || (!siteIdToServerConfig[siteId])) {
    siteId = defaultListenSiteId
  }

    // 尝试查找该站点
  if ((widsInfo = (siteIdToWorkerInfo[siteId])) && widsInfo.wids && widsInfo.wids.length > 0) {
    wids = widsInfo.wids || []

      // 切除第一个-均衡 workerId
    workerId = wids.shift()

      // 插入到末尾
    wids.push(workerId)

    if ((worker = (master && workers[workerId])) && (worker && util.type(worker, 'object') && util.isFunction(worker.send))) {
      master.sendToWorker(worker, 'socket::handle', {
        'type': listenInfo.type,
        'info': util.extend(true, {}, listenInfo, {
          remoteAddress: socket.remoteAddress,
          remoteFamily: socket.remoteFamily,
          remotePort: socket.remotePort
        }),
        'data_by_base64': bufferByBodyEnd.toString('base64')
      }, socket, [{ track: false, process: false }], (state, message) => {
        if (!state) {
            // sys.virtuaHostServerErrorEcho(socket, '转发长连接到子进程处理失败')
        }
      })
    } else {
        // 进程重启吧
      console.log('进程不存在了')

      sys.virtuaHostServerErrorEcho(socket, '进程不存在了')

      return
    }
  } else {
      // 站点还是不存在啊
    sys.virtuaHostServerErrorEcho(socket, 'The site server does not exist')

    return
  }
  headers = hostLower = hostSource = widsInfo = wids = siteId = workerId = worker = void 0
}

  /**
   * [newSocket 新的请求]
   * @author: 桦 <yuchonghua@163.com>
   * @DateTime 2016-11-14T22:10:07+0800
   * @param    {[type]}                 socket       [description]
   * @param    {[type]}                 typePortIp [description]
   * @param    {[type]}                 listenInfo  [description]
   * @return   {[type]}                              [description]
   */
sys.newSocket = function (socket, typePortIp, listenInfo) {
  let bufferByBodyEnd = new Buffer(0)

    // 错误
  socket.on('error', function (e) {
    let args = util.argsToArray(arguments)

    args.unshift('socket::error')

    if (!master.emit.apply(master, args)) {
      args[0] = 'error'
    }
    args = e = void 0
  })

  socket.on('data', function (data) {
    let [headers, serverProxy] = [null, (listenInfo.serverProxy || false)]

      // 累加缓冲区
    bufferByBodyEnd = Buffer.concat([bufferByBodyEnd, data])

    if (bufferBodyIndexOf(bufferByBodyEnd) < 0) {
        // 没有找到body继续等待数据
      return
    }
      // 如果是代理中转服务
    if (serverProxy) {
        // 先测试能否解析json
      let listenInfoTest = false

      try {
        listenInfoTest = JSON.parse(bufferByBodyEnd.toString())
      } catch (e) {}
        // 如果能解析，就提取  listenInfo  和  typePortIp
      if (listenInfoTest && listenInfoTest.typePortIp) {
        listenInfo = listenInfoTest
        listenInfoTest = void 0

        typePortIp = listenInfo.typePortIp

          // 清空管道缓冲区
        bufferByBodyEnd = new Buffer(0)

          // 告诉代理中转服务获取成功
        socket.write('listenInfo_end')

        return
      } else {
          // 告诉代理中转服务获取失败
        socket.write('listenInfo_error')

          // 结束连接
        socket.end()
        return
      }
    }
      // 暂停连接
    socket.pause()

      // 尝试 解析数据头
    if (!(headers = parseRequest(bufferByBodyEnd))) {
      console.error('无法解析头')

      return
    }
    sys.sendSocketToWorker(headers, typePortIp, listenInfo, socket, bufferByBodyEnd)
  })
}

/*
 从请求头部取得请求详细信息
 如果是 CONNECT 方法，那么会返回 { method,host,port,httpVersion}
 如果是 GET/POST 方法，那么返回 { metod,host,port,path,httpVersion}
*/
const parseRequest = function parseRequest (buffer) {
  var s, method, methodMatchres, arr, r

  s = buffer.toString('utf8')

  r = false

  methodMatchres = s.split('\n')[0].match(/^([A-Z]+)\s/)

  if (methodMatchres) {
    method = s.split('\n')[0].match(/^([A-Z]+)\s/)[1]

    if (method === 'CONNECT') {
      arr = s.match(/^([A-Z]+)\s([^:\s]+):(\d+)\sHTTP\/(\d.\d)/)

      if (arr && arr[1] && arr[2] && arr[3] && arr[4]) {
        r = {
          method: arr[1],
          host: arr[2],
          port: arr[3],
          httpVersion: arr[4]
        }
      }
    } else {
      arr = s.match(/^([A-Z]+)\s([^\s]+)\sHTTP\/(\d.\d)/)

      if (arr && arr[1] && arr[2] && arr[3]) {
        var host
        try {
          host = s.match(/Host:\s+([^\n\s\r]+)/i)
          host = host && host[1] || undefined
        } catch (e) {
          host = undefined
        }

        if (host) {
          var _p = host.split(':', 2)

          r = {
            method: arr[1],
            host: _p[0],
            port: _p[1] ? _p[1] : undefined,
            path: arr[2],
            httpVersion: arr[3]
          }
        }
      }
    }
  }
  s = method = methodMatchres = arr = buffer = undefined
  return r
}

/*
 从缓存中找到头部结束标记("\r\n\r\n")的位置
*/
const bufferBodyIndexOf = function bufferBodyIndexOf (b) {
  for (var i = 0, len = b.length - 3; i < len; i++) {
    if (b[i] === 0x0d && b[i + 1] === 0x0a && b[i + 2] === 0x0d && b[i + 3] === 0x0a) {
      return i + 4
    }
  }
  return -1
}