// Copyright © 2015, 2017 IBM Corp. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
'use strict';

// reconfigure deals with the various ways the credentials can be passed in
// and returns an full URL
// e.g. { account:"myaccount", password: "mypassword"}
// or   { key: "mykey", password: "mykey", account:"myaccount"}
// or   { key: "mykey", password: "mykey", account:"myaccount"}
// or   { account:"myaccount.cloudant.com", password: "mykey"}
// or   { account: "myaccount"}
// or   { url: "https://mykey:mypassword@myaccount.cloudant.com"}
// or   { instanceName: "mycloudantservice", vcapServices: JSON.parse(process.env.VCAP_SERVICES)}

var url = require('url');

module.exports = function(config) {
  config = JSON.parse(JSON.stringify(config)); // clone

  var outUrl;
  // if a full URL is passed in
  if (config.url) {
    // parse the URL
    var parsed = null;
    try {
      parsed = url.parse(config.url);
    } catch (e) {
      parsed = null;
    }
    if (!config.url || !parsed || !parsed.hostname || !parsed.protocol || !parsed.slashes) {
      return null;
    }

    // enforce HTTPS for *cloudant.com domains
    if (parsed.hostname.match(/cloudant\.com$/) && parsed.protocol === 'http:') {
      console.warn('WARNING: You are sending your password as plaintext over the HTTP; switching to HTTPS');

      // force HTTPS
      parsed.protocol = 'https:';

      // remove port number and path
      parsed.host = parsed.host.replace(/:[0-9]*$/, '');
      delete parsed.port;
      delete parsed.pathname;
      delete parsed.path;

      // reconstruct the URL
      config.url = url.format(parsed);
    }

    outUrl = config.url;
  } else if (config.vcapServices) {
    var cloudantServices;
    if (typeof config.vcapServiceName !== 'undefined') {
      cloudantServices = config.vcapServices[config.vcapServiceName];
    } else {
      cloudantServices = config.vcapServices.cloudantNoSQLDB;
    }

    if (!cloudantServices || cloudantServices.length === 0) {
      throw new Error('Missing Cloudant service in vcapServices');
    }

    if (typeof config.vcapInstanceName !== 'undefined') {
      config.instanceName = config.vcapInstanceName; // alias
    }

    for (var i = 0; i < cloudantServices.length; i++) {
      if (typeof config.instanceName === 'undefined' || cloudantServices[i].name === config.instanceName) {
        var credentials = cloudantServices[i].credentials;
        if (credentials && credentials.url) {
          outUrl = credentials.url;
          break;
        } else {
          throw new Error('Invalid Cloudant service in vcapServices');
        }
      }
    }

    if (!outUrl) {
      throw new Error('Missing Cloudant service in vcapServices');
    }
  } else {
    var options = getOptions(config);
    var username = options.username;
    var password = options.password;

    // Configure for Cloudant, either authenticated or anonymous.
    config.url = 'https://' + encodeURIComponent(username) + ':' +
                    encodeURIComponent(password) + '@' +
                    encodeURIComponent(config.account);

    console.log(config.url);

    outUrl = config.url;
  }

  // We trim out the trailing `/` because when the URL tracks down to `nano` we have to
  // worry that the trailing `/` doubles up depending on how URLs are built, this creates
  // "Database does not exist." errors.
  // Issue: cloudant/nodejs-cloudant#129
  if (outUrl && outUrl.slice(-1) === '/') {
    outUrl = outUrl.slice(0, -1);
  }

  return (outUrl || null);
};

module.exports.getOptions = getOptions;
function getOptions(config) {
  // The username is the account ("foo" for "foo.cloudant.com")
  // or the third-party API key.
  var result = {password: config.password, username: config.key || config.username || config.account};
  return result;
}
