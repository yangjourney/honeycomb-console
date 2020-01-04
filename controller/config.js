'use strict';
const utils = require('../common/utils');
const cluster = require('../model/cluster');
const appConfig = require('../model/app_config');
const jsonParser = require('editor-json-parser');
const callremote = utils.callremote;


/**
 * @api {get} /api/config/:appName/get
 * @nowrap
 * @param req
 * @param res
 */
exports.getAppConfig = function (req, res) {
  let clusterCode = req.query.clusterCode;
  let opt = cluster.getClusterCfgByCode(clusterCode);
  if (opt.code === 'ERROR') {
    return res.json(opt);
  }
  let appName = req.params.appName;
  let type = req.query.type;
  let path = `/api/config/${type}/${appName}`;
  callremote(path, opt, function (err, results) {
    if (err) {
      res.json({
        code: 'GET_APPS_CONFIG_FAILED',
        message: err.message
      });
    } else {
      res.json(results);
    }
  });
};

/**
 * @api {get} /api/config/:appName/persistent
 * @nowrap
 * @param req
 * @param res
 */
exports.getAppConfigPersistent = function (req, res) {
  let clusterCode = req.query.clusterCode;
  let opt = cluster.getClusterCfgByCode(clusterCode);
  if (opt.code === 'ERROR') {
    return res.json(opt);
  }
  let app = req.params.appName;
  appConfig.getAppConfig({clusterCode, app}, (err, data) => {
    if (err) {
      return res.json({
        code: 'ERROR',
        message: 'get app\'s persistent config failed' + err.message
      });
    }
    res.json({
      code: 'SUCCESS',
      data
    });
  });
};

/**
 * @api {get} /api/config/:appName/history
 * @nowrap
 * @param req
 * @param res
 */
exports.getAppConfigHistory = function (req, res) {
  let clusterCode = req.query.clusterCode;
  let opt = cluster.getClusterCfgByCode(clusterCode);
  if (opt.code === 'ERROR') {
    return res.json(opt);
  }
  let app = req.params.appName;
  appConfig.getAppConfigAllHistory({clusterCode, app}, (err, data) => {
    if (err) {
      return res.json({
        code: 'ERROR',
        message: 'get app\'s persistent config failed' + err.message
      });
    }
    res.json({
      code: 'SUCCESS',
      data: data
    });
  });
};



/**
 * @api {post} /api/config/:appName/update
 * @nowrap
 * @param req
 * @param res
 */
exports.setAppConfig = function (req, res) {
  let appName = req.params.appName;
  let type = req.body.type;
  req.oplog({
    clientId: req.ips.join('') || '-',
    opName: 'SET_APP_CONFIG',
    opType: 'PAGE_MODEL',
    opLogLevel: 'NORMAL',
    opItem: 'APP_CONFIG',
    opItemId: appName
  });
  let clusterCode = req.body.clusterCode;
  let opt = cluster.getClusterCfgByCode(clusterCode);
  if (opt.code === 'ERROR') {
    return res.json(opt);
  }
  let path = `/api/config/${type}/${appName}`;
  opt.method = 'POST';
  try {
    opt.data = jsonParser.parse(req.body.appConfig);
  } catch (e) {
    return res.json({
      code: 'INVALID_JSON',
      message: e.message
    });
  }
  let cfgObj = {
    clusterCode,
    app: appName,
    config: opt.data,
    user: req.session.username
  };
  appConfig.save(cfgObj, (err) => {
    if (err) {
      return res.json({
        code: 'ERROR',
        message: 'presist app config failed, check honeycomb-console\'s metadb',
      });
    }
    callremote(path, opt, function (err) {
      if (err) {
        res.json({
          code: 'SET_APPS_CONFIG_FAILED',
          message: err.message
        });
      } else {

        res.json({code: 'SUCCESS'});
      }
    });
  });
};
