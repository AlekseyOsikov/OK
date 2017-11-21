let fs = require("fs");
let opts = require("optimist")
            .default('mode', '1')
            .default('logLevel', 'info')
            .default('logFile', 'log/createDataHelp.log')
            .argv;
let log4js = require('log4js');
let geoSrc = JSON.parse(fs.readFileSync("data/in/geo.geojson", "utf8"));
let info = require("./data/help/infoHelp.json");
log4js.configure({
  appenders: { createDataHelp: { type: 'file', filename: opts.logFile } },
  categories: { default: { appenders: ['createDataHelp'], level: opts.logLevel } }
});
let logger = log4js.getLogger('createDataHelp');
// ИВР, № объекта, с, по, индекс ИВР
let dataFrom = info.dataFrom, // [4002, 0, 0, 470, 1732];
    dataTo = info.dataTo, // [3955, 0, 0, 3295, 4474];
    showCoord = info.showCoord, // [3955, 0, 0, 3295];
    coordRev = info.coordRev; // [3955, 0, 1];
let isReverse = true;

logger.info("-------------------------------------------------------");
logger.info("-------------------------------------------------------");
logger.info((new Date).toString());
logger.info("-------------------------------------------------------");
logger.info("-------------------------------------------------------");

geoSrc.features.forEach(function(item, i, arr) {
    if (item.properties.id == dataFrom[0]) {
        dataFrom.push(i);
    } else if (item.properties.id == dataTo[0]) {
        dataTo.push(i);
    }
    if (item.properties.id == showCoord[0]) {
        showCoord.push(i);
    }
    if (item.properties.id == coordRev[0]) {
        coordRev.push(i);
    }
});

if (dataFrom.length != 6 && dataTo.length != 6 && showCoord.length != 5 && coordRev.length != 4) {
    
    console.warn("ИВР не найдено, выполнение завершено");
    logger.info("ИВР не найдено, выполнение завершено");
    
} else if (opts.mode == '2') {

    console.log("coord: " + geoSrc.features[showCoord[4]].geometry.coordinates[showCoord[1]][showCoord[2]][showCoord[3]]);
    logger.info("coord: " + geoSrc.features[showCoord[4]].geometry.coordinates[showCoord[1]][showCoord[2]][showCoord[3]]);

} else if (opts.mode == '3') {

    let arr = geoSrc.features[coordRev[3]].geometry.coordinates[coordRev[1]][coordRev[2]].reverse();
    let res = "";
    arr.forEach(function(item, i, arr) {
        res = res + (res.length > 0 ? ',' : '') + '[' + item + ']';
    });
    console.log("coord: " + res);
    logger.info("coord: " + res);

} else {

    let arrTo = geoSrc.features[dataTo[5]].geometry.coordinates[dataTo[1]][dataTo[2]];
    let diff = (dataFrom[4] - dataFrom[3]) - (dataTo[4] - dataTo[3]);
    
    let lengthTo = arrTo.length;
    let strTo = "befor: " + arrTo[dataTo[3] - 1] + "; " + arrTo[dataTo[3]] + "; " + arrTo[dataTo[4]] + "; " + arrTo[dataTo[4] + 1];

    let subArrFrom = geoSrc.features[dataFrom[5]].geometry.coordinates[dataFrom[1]][dataFrom[2]].slice(dataFrom[3],dataFrom[4] + 1);
    logger.info("subArrFrom (" + dataFrom[0] + ") src: " + subArrFrom.length);

    if (isReverse) {
        subArrFrom.reverse();
        logger.info("subArrFrom (" + dataFrom[0] + ") rev: " + subArrFrom.length);
    }

    let res = arrTo.slice(0, dataTo[3]);
    logger.info("res (" + dataTo[0] + ") 1: " + res.length);

    subArrFrom.forEach(function(item, i, arr) {
        res.push(item);
    });
    logger.info("res (" + dataTo[0] + ") 2: " + res.length);

    let arrToEnd = arrTo.slice(dataTo[4] + 1);
    arrToEnd.forEach(function(item, i, arr) {
        res.push(item);
    });
    logger.info("res (" + dataTo[0] + ") 3: " + res.length);

    geoSrc.features[dataTo[5]].geometry.coordinates[dataTo[1]][dataTo[2]] = res;
    arrTo = geoSrc.features[dataTo[5]].geometry.coordinates[dataTo[1]][dataTo[2]];

    logger.info("arrTo (" + dataTo[0] + "): " + lengthTo + " + " + diff + " = " + arrTo.length);
    logger.info(strTo);
    logger.info("after: " + arrTo[dataTo[3] - 1] + "; " + arrTo[dataTo[3]] + "; " + arrTo[dataTo[4] + diff] + "; " + arrTo[dataTo[4] + diff + 1]);

    let resultHelp = JSON.stringify(geoSrc.features[dataTo[5]]);

    logger.info("-------------------------------------------------------");

    fs.writeFileSync("data/help/resultHelp.geojson", resultHelp);

}