const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');

async function createGPX(options) {
    await writeHeader(options);
    const fileStream = fs.createReadStream(options.input);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        const split = line.split(',');
        const point = { lat: split[0], lon: split[1], timestamp: split[2] };
        let trkpt = '			<trkpt ';
        trkpt += `lat="${point.lat}" lon="${point.lon}">\n`;
        trkpt += `				<time> ${point.timestamp} </time>\n`;
        trkpt += '			</trkpt>\n';
        fs.appendFileSync(path.join(options.outputDir, 'track.gpx'), trkpt);
    }
    await writeFooter(options);
    return [path.join(options.outputDir, 'track.gpx')];
}

async function writeHeader(options) {
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
  <gpx version="1.1" creator="${options.creator}"
          xmlns="http://www.topografix.com/GPX/1/1"  
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
          xmlns:gpxx="http://www8.garmin.com/xmlschemas/GpxExtensions/v3"
          xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd https://www8.garmin.com/xmlschemas/GpxExtensions/v3 https://www8.garmin.com/xmlschemas/GpxExtensions/v3/GpxExtensionsv3.xsd"
  >
      <metadata/>
      <trk>
          <trkseg>
  `;
  fs.writeFileSync(path.join(options.outputDir, 'track.gpx'), header);
}

async function writeFooter(options) {
  const footer = '		</trkseg>\n	</trk>\n</gpx>';
  fs.appendFileSync(path.join(options.outputDir, 'track.gpx'), footer);
}


const creator = 'signalktracker'
async function processLineByLine() {
  const fileStream = fs.createReadStream('input.txt');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  // Note: we use the crlfDelay option to recognize all instances of CR LF
  // ('\r\n') in input.txt as a single line break.

  for await (const line of rl) {
    // Each line in input.txt will be successively available here as `line`.
    console.log(`Line from file: ${line}`);
    const split = line.split(',');
    const point = { lat: split[0], lon: split[1], timestamp: split[2] };
    console.log(`point: ${JSON.stringify(point)}`);
    let trkpt = '			<trkpt ';
    trkpt += `lat="${point.lat}" lon="${point.lon}">\n`;
    trkpt += `				<time> ${point.timestamp} </time>\n`;
    trkpt += '			</trkpt>\n';
    await fs.appendFile('track.gpx',trkpt);
  }
}

module.exports = createGPX;