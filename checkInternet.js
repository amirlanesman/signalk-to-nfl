const dns = require('dns')

function checkInternet() {
    return new Promise((resolve) => {
        dns.lookup('google.com', (err) => {
            if (err && err.code == "ENOTFOUND") {
                resolve(false);
            } else {
                resolve(true);
            }
        })
    })
}

module.exports = checkInternet;