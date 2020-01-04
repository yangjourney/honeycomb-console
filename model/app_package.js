const log = require('../common/log');
const db = require('../common/db');
const config = require('../config');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 保存pkg到数据库
 */
const INSERT_APP_PKG = `INSERT INTO
    hc_console_system_cluster_app_pkgs (cluster_code, app_id, app_name, weight, package, user, gmt_create)
  VALUES(?, ?, ?, ?, ?, ?, ?);`;
exports.savePackage = (data, callback) => {
  let d = new Date();
  if (db.type === 'sqlite' && !config.debug) {
    return callback(null);
  }
  db.query(
    INSERT_APP_PKG,
    [data.clusterCode, data.appId, data.appName, data.appWeight, fs.readFileSync(data.pkg), data.user, d],
    function (err) {
      if (err) {
        log.error('Insert pkg failed:', err);
        return callback(err);
      } else {
        log.info('insert pkg success');
        callback(null);
      }
    }
  );
};

/**
 * 根据集群和appName获取最新pkg到临时文件
 */
const GET_APP_PKG = `
  SELECT 
    cluster_code, app_id, app_name, max(weight), package
  FROM hc_console_system_cluster_app_pkgs
  WHERE cluster_code = ? and app_name = ? group by cluster_code, app_id, app_name;
`;
exports.getPackage = (query, callback) => {
  let d = new Date();
  db.query(
    GET_APP_PKG,
    [query.clusterCode, query.appName],
    function (err, data) {
      if (err) {
        log.error('get app pkg failed:', err);
        return callback(err);
      } else {
        log.info('get app pkg success');
        if (data[0]) {
          let tmpFile = path.join(os.tmpdir(), data[0].cluster_code + '^' + data[0].app_id + '.tgz');
          fs.writeFileSync(tmpFile, data.package, 'utf8');
          data[0].package = tmpFile;
        }
        callback(null, data[0]);
      }
    }
  );
};