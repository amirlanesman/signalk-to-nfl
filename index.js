const {EOL} = require('os');
const internetTestAddress = 'google.com';
const internetTestTimeout = 1000;

module.exports = function (app) {
  const isReachable = require('is-reachable');
  const sendEmail = require('./sendEmail');
  const createGPX = require('./createGPX');
  const fs = require('fs-extra');
  const path = require('path');
  const CronJob = require('cron').CronJob;


  var plugin = {};
  plugin.id = 'signalk-to-nfl';
  plugin.name = 'SignalK To NFL';
  plugin.description = 'SignalK track logger to noforeignland.com';

  plugin.schema = {
    "title": plugin.name,
    "description": "Some parameters need for use",
    "type": "object",
    "required": ["emailCron", "emailService", "emailUser", "emailPassword", "emailFrom", "emailTo"],
    "properties": {
      "trackDir": {
        "type": "string",
        "title": "Directory with tracks to cache tracks.",
        "description": "Path in server filesystem, absolute or from plugin directory. optional param.",
      },
      "trackFrequency": {
        "type": "integer",
        "title": "Position tracking frequency, sec.",
        "description": "To keep file sizes small we only log positions once in a while (unless you set this value to 0)",
        "default": 60
      },
      "minMove": {
        "type": "number",
        "title": "Minimum boat move to log",
        "description": "To keep file sizes small we only log positions if a move larger than this size is noted (if set to 0 will log every move)",
        "default": 50
      },
      "filterSource": {
        "type": "string",
        "title": "Position source device",
        "description": "Set this value to the name of a source if you want to only use the position given by that source.",
      },
      "emailCron": {
        "type": "string",
        "title": "Email attempt CRON",
        "description": "We send the tracking email to NFL once in a while, you can set the schedule with this setting. CRON format: https://crontab.guru/",
        "default": '*/10 * * * *',
      },
      "emailService": {
        "type": "string",
        "title": "Email service in use to send tracking reports",
        "description": "Email service for outgoing mail from this list: https://community.nodemailer.com/2-0-0-beta/setup-smtp/well-known-services/",
        "default": 'gmail',
      },
      "emailUser": {
        "type": "string",
        "title": "Email user",
        "description": "Email user for outgoing mail. Normally should be set to the your email.",
      },
      "emailPassword": {
        "type": "string",
        "title": "Email user password",
        "description": "Email user password for outgoing mail. check out the readme 'Requirements' section for more info.",
      },
      "emailFrom": {
        "type": "string",
        "title": "Email 'From' address",
        "description": "Address must be set in NFL. Normally should be set to the your email. check out the readme 'Requirements' section for more info.",
      },
      "emailTo": {
        "type": "string",
        "title": "Email 'to' address",
        "description": "Email address to send track GPX files to. defaults to: tracking@noforeignland.com. (can be set to your own email for testing purposes)",
        "default": 'tracking@noforeignland.com',
      },
    }
  };

  var unsubscribes = []; 
  var unsubscribesControl = [];
  var routeSaveName = 'track.jsonl'; 
  let lastPosition;
  let cron;
  const creator = 'signalk-track-logger';
  const defaultTracksDir = 'track';

  plugin.start = function (options, restartPlugin) {
    if (!options.trackDir) options.trackDir = defaultTracksDir;
    if (!path.isAbsolute(options.trackDir)) options.trackDir = path.join(__dirname, options.trackDir);
    //app.debug('options.trackDir=',options.trackDir);
    if (!createDir(options.trackDir)) {
      plugin.stop();
      return;
    }

    app.debug('track logger started, now logging to', options.trackDir);
    app.setPluginStatus(`Started`);

    doLogging();

    function doLogging() {
      app.subscriptionmanager.subscribe({
        "context": "vessels.self",
        "subscribe": [
          {
            "path": "navigation.position",
            "format": "delta",
            "policy": "instant",
            "minPeriod": options.trackFrequency ? options.trackFrequency * 1000 : 0,
          }
        ]
      },
        unsubscribes,
        subscriptionError => {
          app.debug('Error subscription to data:' + subscriptionError);
          app.setPluginError('Error subscription to data:' + subscriptionError.message);
        },
        doOnValue	// функция обработки каждой delta
      ); // end subscriptionmanager

      function doOnValue(delta) {

        delta.updates.forEach(update => {
          // app.debug(`update:`, update);
          if (options.filterSource && update.$source !== options.filterSource) {
            return;
          }
          let timestamp = update.timestamp;
          update.values.forEach(value => {
            // app.debug(`value:`, value);

            if (!isDefined(value.value.latitude) || !isDefined(value.value.longitude))  {
              return;
            }
            if (options.minMove && lastPosition && equirectangularDistance(lastPosition.pos, value.value) < options.minMove) {
              return;
            }
            lastPosition = {pos: value.value, timestamp };
            savePoint(lastPosition);
          });
        });
      } // end function doOnValue
    } // end function doLogging

    function savePoint(point) {
      //{pos: {latitude, longitude}, timestamp}
      // Date.parse(timestamp)
      const obj = {
        lat: point.pos.latitude,
        lon: point.pos.longitude,
        t: point.timestamp,
      }
      app.debug(`save data point:`, obj);
      fs.appendFileSync(path.join(options.trackDir, routeSaveName), JSON.stringify(obj) + EOL);
    }

    function isDefined(obj) {
      return (obj !== undefined && obj !== null);
    }

    function equirectangularDistance(from, to) {
      // https://www.movable-type.co.uk/scripts/latlong.html
      // from,to: {longitude: xx, latitude: xx}
      const rad = Math.PI / 180;
      const φ1 = from.latitude * rad;
      const φ2 = to.latitude * rad;
      const Δλ = (to.longitude - from.longitude) * rad;
      const R = 6371e3;	// метров
      const x = Δλ * Math.cos((φ1 + φ2) / 2);
      const y = (φ2 - φ1);
      const d = Math.sqrt(x * x + y * y) * R;	// метров
      return d;
    } // end function equirectangularDistance

    function createDir(dir) {
      let res = true;
      if (fs.existsSync(dir)) {
        try {
          fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
        }
        catch (error) {
          app.debug('[createDir]', error.message);
          app.setPluginError(`No rights to directory ${dir}`);
          res = false;
        }
      }
      else {
        try {
          fs.mkdirSync(dir, { recursive: true });
        }
        catch (error) {
          switch (error.code) {
            case 'EACCES':	// Permission denied
            case 'EPERM':	// Operation not permitted
              app.debug(`False to create ${dir} by Permission denied`);
              app.setPluginError(`False to create ${dir} by Permission denied`);
              res = false;
              break;
            case 'ETIMEDOUT':	// Operation timed out
              app.debug(`False to create ${dir} by Operation timed out`);
              app.setPluginError(`False to create ${dir} by Operation timed out`);
              res = false;
              break;
          }
        }
      }
      return res;
    } // end function createDir

    async function interval(){
      if (await checkTrack() && await testInternet()) {
        await sendData();
      }
    }

    async function testInternet() {
      app.debug('testing internet connection');
      const check = await isReachable(internetTestAddress, {timeout: internetTestTimeout});
      app.debug('internet connection = ', check);
      return check;
    }
    
    async function checkTrack() {
      const trackFile = path.join(options.trackDir, routeSaveName);
      app.debug('checking the track', trackFile, 'if should send');
      const exists = await fs.pathExists(trackFile);
      const size = exists ? (await fs.lstat(trackFile)).size : 0;
      app.debug(`'${trackFile}'.size=${size} ${trackFile}'.exists=${exists}`);
      return  size > 0;
    }
    
    async function sendData(){
      app.debug('sending the data');
      const gpxFiles = await createGPX({input: path.join(options.trackDir, routeSaveName), outputDir: options.trackDir, creator});
      app.debug('created GPX files', gpxFiles);
      try {
        for (let file of gpxFiles) {
          app.debug('sending', file);
          try {
            !await sendEmail({
            emailService: options.emailService,
            user: options.emailUser,
            password: options.emailPassword,
            from: options.emailFrom,
            to: options.emailTo,
            trackFile: file
            })
          } catch (err){
            app.debug('Sending email failed:', err);          
            return;
          }
        } 
      } finally {
        for (let file of gpxFiles) {
          app.debug('deleting', file);
          fs.rmSync(file);
        } 
      }
      fs.rmSync(path.join(options.trackDir, routeSaveName));
    }
    
    app.debug('Setting CRON to ', options.emailCron);
    cron = new CronJob(
      options.emailCron,
      interval
    );
    cron.start();
  }; 	// end plugin.start

  plugin.stop = function () {
    app.debug('plugin stopped');
    if (cron) {
      cron.stop();
      cron = undefined;
    }
    unsubscribesControl.forEach(f => f());
    unsubscribesControl = [];
    unsubscribes.forEach(f => f());
    unsubscribes = [];
    app.setPluginStatus('Plugin stopped');
  }; // end plugin.stop


  return plugin;
};
