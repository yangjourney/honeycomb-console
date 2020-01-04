'use strict';
const fs = require('fs');
const crypto = require('crypto');
const childProcess = require('child_process');
const url = require('url');
const qs = require('querystring');
const _ = require('lodash');
const urllib = require('urllib');

const log = require('./log');

exports.urlencode = function (str) {
  try {
    return encodeURIComponent(str);
  } catch (e) {
    log.error(e.stack);
    return str;
  }
};

exports.urldecode = function (str) {
  try {
    return decodeURIComponent(str);
  } catch (e) {
    log.error(e.stack);
    return str;
  }
};

exports.md5 = function (str) {
  if (typeof str !== 'string') {
    throw new Error('md5 only support string');
  }
  let hash = crypto.createHash('md5');
  hash.update(str);
  return hash.digest('hex');
};

exports.sha256 = function (str) {
  if (typeof str !== 'string') {
    throw new Error('sha256 only support string');
  }
  let hash = crypto.createHash('sha256');
  hash.update(str);
  return hash.digest('hex');
};

exports.md5base64 = function (buf) {
  return crypto.createHash('md5').update(buf, 'utf8').digest('base64');
};

exports.sha1 = function (str, secret) {
  return crypto.createHmac('sha1', secret).update(str).digest('base64');
};

exports.getUidAndGid = function (changeUser) {
  if (!changeUser) { return {}; }
  const uid = process.getuid();
  if (uid >= 500) {
    return {uid: process.getuid(), gid: process.getgid()};
  }
  const gidFile = '/etc/passwd';
  const str = fs.readFileSync(gidFile, 'utf-8');
  const reg  = /[^app]admin:x:+(\d+):(\d+)/;
  const res  = str.match(reg);
  if (!res) { return {}; }
  const user = {
    uid: +res[1],
    gid: +res[2]
  };
  return user;
};

/**
 * @param {String} command the command string
 * @param {Object} options
 *        - timeout unit ms, default is 10's
 *        - maxBuffer default is 200k
 * @param {Function} cb()
 */
exports.exec = function (command, options, cb) {
  if ('function' === typeof options) {
    cb = options;
    options = {};
  }
  if (options.timeout === undefined) {
    options.timeout = 120000;
  }
  log.info(`exec command: ${command}`);
  childProcess.exec(command, options, function (err, stdout, stderr) {
    if (err) {
      // Mac 下打包的tgz文件和linux下不一致，但不影响解压，只是会报如下信息的错误, 所有当此错误时忽略
      if (err.stack && err.stack.indexOf('tar: Ignoring unknown extended header keyword') < 0) {
        log.error(`exec command: ${command} failed`, err);
        return cb(err, [stdout, stderr]);
      }
    }
    return cb(null, [stdout, stderr]);
  });
};

exports.parseAppId = function (appId) {
  let tmp = appId.split('_');
  let version = '0.0.0';
  let appName;
  let buildNum = 0;

  if (tmp.length === 1) {
    appName = appId;
  } else if (tmp.length === 2) {
    version = tmp.pop();
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      version = '0.0.0';
      appName = appId;
    } else {
      appName = tmp;
    }
  } else if (tmp.length >= 3) {
    buildNum = tmp.pop();
    if (!/^\d+$/.test(buildNum)) {
      if (/^\d+\.\d+\.\d+$/.test(buildNum)) {
        version = buildNum;
        appName = tmp.join('_');
      } else {
        version = '0.0.0';
        appName = appId;
      }
      buildNum = 0;
    } else {
      version = tmp.pop();
      if (!/^\d+\.\d+\.\d+$/.test(version)) {
        tmp.push(version);
        appName = tmp.join('_');
        version = '0.0.0';
      } else {
        appName = tmp.join('_');
      }
    }
  }

  return {
    name: appName,
    version: version,
    buildNum: buildNum,
    id: appId,
    weight: genWeight(version || '0.0.0.0', buildNum),
    md5: ''
  };
};

exports.sign = function (queryPath, options, token) {
  let contentMd5;
  let date = new Date().toGMTString();
  let accept = 'application/json';
  let contentType = options.headers['content-type'] ||  options.headers['Content-Type'] || 'application/json';
  let stringToSign;
  if (['POST', 'PUT', 'PATCH'].indexOf(options.method) >= 0) {
    let tmp = options.data ? JSON.stringify(options.data) : '';
    contentMd5 = exports.md5base64(tmp);
  } else {
    contentMd5 = '';
    if (options.data) {
      let tmp = url.parse(queryPath, true);
      _.merge(tmp.query, options.data);
      queryPath = tmp.pathname + '?' + qs.stringify(tmp.query);
    }
    options.data = undefined;
  }
  stringToSign = `${options.method}\n${accept}\n${contentMd5}\n${contentType}\n${date}\n${queryPath}`;
  options.headers['Content-Type'] = contentType;
  log.debug('String to be signed: ', stringToSign,queryPath);
  let signature = exports.sha1(stringToSign, token);
  options.headers.Authorization = `system admin:${signature}`;
  options.headers.Date = date;

  return {
    signature: signature,
    queryPath: queryPath
  };
};

/**
 * call cluster endpoint
 * @param  {String}   queryPath  路径
 * @param  {Object}   options  [description]
 * @param  {Function} callback [description]
 */
exports.callremote = function (queryPath, options, callback) {
  let endpoint = options.endpoint;
  let token = options.token;
  let ips = options.ips.join(',');
  let defaultOptions = {
    method: 'GET',
    headers: {},
    timeout: 15000,
    dataType: 'json',
    rejectUnauthorized: false
  };

  options = _.merge(defaultOptions, options);

  if (queryPath.indexOf('?')) {
    queryPath += '?ips=' + ips;
  } else {
    queryPath += '&ips=' + ips;
  }
  if(endpoint.endsWith('/')){
    endpoint = endpoint.substring(0, endpoint.length - 1);
  }
  delete options.endpoint;
  delete options.token;
  delete options.ips;

  let signed = exports.sign(queryPath, options, token);
  let qpath = endpoint + signed.queryPath;
  log.debug(`${options.method} ${qpath}`);
  urllib.request(qpath, options, function (err, data) {
    if (err) {
      callback(err);
    } else {
      callback(null, data);
    }
  });
};

/**
 * 把版本号和 build号计算成权重值，方便排序
 */
function genWeight(version, buildNum) {
  let tmp = version.split('.');
  tmp = _.reverse(tmp);
  let weight = 0;
  tmp.forEach(function (t, i) {
    weight += Number(t) * Math.pow(1000, i);
  });
  weight += Number(buildNum) / 1000;
  return weight;
}
// 对 server 接口 /api/apps 的返回做处理，合并apps信息
exports.mergeAppInfo = function (ips, apps) {
  let result = {};
  apps.forEach(function (app) {
    let name = app.name;
    let id = app.appId;
    let ip = app.ip;
    let version = app.version;
    let buildNum = app.buildNum;
    let publishAt = app.publishAt;
    let workerNum = app.workerNum;
    let isCurrWorking = app.isCurrWorking;
    let expectWorkerNum = app.expectWorkerNum;
    let vkey = app.version + '_' + app.buildNum;

    // create app object
    if (!result[name]) {
      result[name] = {
        name: name,
        versions: {}
      };
    }

    let appObj = result[name];
    let versions = appObj.versions;

    if (!versions[vkey]) {
      versions[vkey] = {
        version: version,
        buildNum: buildNum,
        publishAt: publishAt,
        appId: id,
        weight: genWeight(version || '0.0.0.0', buildNum),
        cluster: {},
        isCurrWorking: isCurrWorking
      };
    }

    let cluster = versions[vkey].cluster;
    if (!cluster[ip]) {
      cluster[ip] = {
        ip: ip,
        status: app.status,
        workerNum: workerNum,
        expectWorkerNum: expectWorkerNum,
        errorExitCount: app.errorExitCount,
        errorExitRecord: app.errorExitRecord
      };
    }
  });

  let data = [];
  Object.keys(result).forEach(function (key) {
    let app = result[key];
    let versions = app.versions;
    let vlist = [];
    Object.keys(versions).forEach(function (v) {
      let version = versions[v];
      let cluster = version.cluster;
      let vms = [];
      Object.keys(cluster).forEach(function (vm) {
        vms.push(cluster[vm]);
      });

      // 补齐cluster， 如果某个ip没有app，设置status为none
      ips.forEach(function (ip) {
        let idx = _.findIndex(vms, function (vm) { return ip === vm.ip; });
        if (idx < 0) {
          vms.push({
            ip: ip,
            status: 'none'
          });
        }
      });

      vms.sort(function (a, b) {
        if (a.ip > b.ip) {
          return 1;
        } else {
          return -1;
        }
      });
      version.cluster = vms;
      vlist.push(version);
    });
    vlist.sort(function (a, b) {
      if (a.weight > b.weight) {
        return 1;
      } else {
        return -1;
      }
    });
    app.versions = vlist;
    data.push(app);
  });
  data.sort(function (a, b) {
    if (a.name > b.name) {
      return 1;
    } else {
      return -1;
    }
  });

  return data;
};
