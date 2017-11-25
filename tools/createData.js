let fs = require("fs");
let opts = require("optimist")
            .default('logLevel', 'info')
            .default('logFile', 'log/createData.log')
            .default('ivr', "")
            .argv;
let log4js = require('log4js');
let myLib = require("./js-lib/libData");
let infoJSON = require("./data/in/info.json");

const POGR = 3e-5,              // погрешность при вычислении общих вершин
      MULTIPLIER_TO_INT = 1e6,  // множитель для преобразования координаты в целое
      FRACTION = 2,             // количество занимаемых байт числом
      MULTIPLIER_POZ = 0xFFFF;  // множитель для позиционирования
      
let geoJSON = JSON.parse(fs.readFileSync("data/in/geo.geojson", "utf8"));

log4js.configure({
  appenders: { createData: { type: 'file', filename: opts.logFile } },
  categories: { default: { appenders: ['createData'], level: opts.logLevel } }
});

let globalData = {
    IVDIVO: {},
    pairsWay: {},
    finishedPodr: [],
    ways: [],
    index: 0,
    numWay: 0
};

let isError = false,
    prefix = "+";

let logger = log4js.getLogger('createData');
    
let strPodr = opts.ivr;

class Regions {
    constructor() {
        this._date = (new Date).toString();
        this.regions = {};
        this.paths = {};
        this.ways = {};
        this.meta = {
            name: "ИВДИВО"
        };
    }
    
}
      
class PartBorders {
    constructor(id, coord, iObj, iGr, fp, lp, sosed = null, iSObj = null, iSGr = null, sfp = null, slp = null, isReverse = false) {
        this.id = id;
        this.coordinates = coord;   // массив координат / way;
        this.iObj = iObj;           // i-й объект
        this.iGr = iGr;             // i-я граница (0 - внешняя, остальные - внутринние)
        this.firstPosition = fp;    // начальная позиция
        this.lastPosition = lp;     // конечная позиция
        this.sosed = sosed;         // сосед / null
        this.iSObj = iSObj;         // i-й объект
        this.iSGr = iSGr;           // i-я граница (0 - внешняя, остальные - внутринние)
        this.sFirstPosition = sfp;  // начальная позиция у соседа
        this.sLastPosition = slp;   // конечная позиция у соседа
        this.isReverse = isReverse; // реверсивность (порядок обхода)
    }
    
    toString() {
        return "" + this.id + ": [" + this.iObj + "][" + this.iGr + "][" + this.firstPosition + " .. " + this.lastPosition + "]; "
                + this.sosed + ": [" + this.iSObj + "][" + this.iSGr + "]["
                + (this.isReverse ? this.sLastPosition : this.sFirstPosition) + " .. "
                + (this.isReverse ? this.sFirstPosition : this.sLastPosition) + "]"
                + (this.isReverse ? ", rev" : "");
    }
}

class PodrIVDIVO {
    
    constructor(id, name, coordinates, countBorders, globalData, logger) {
        this.id = id;
        this.name = name;
        this.coordinates = coordinates;
        this.globalData = globalData;
        this.logger = logger;
        
        this.index = ++globalData.index;
        this.innerSosedi = [];
        this.outerSosedi = [];
        this.matrica = [];
        this.sosedLastIndex = {};
        this.path = [];
		
		this.checkCountBorders = countBorders;
        this.checkCurCountBorders = 0;

        for (let iObj = 0; iObj < this.coordinates.length; iObj++) {
            for (let iGr = 0; iGr < this.coordinates[iObj].length; iGr++) {
                if (this.isEqual(this.coordinates[iObj][iGr][0], this.coordinates[iObj][iGr][this.coordinates[iObj][iGr].length - 1])) {
                    this.coordinates[iObj][iGr].pop();
                }
            }
        }

    }

    isEqual(x, y) {
        if (x == null && y == null) {
            return true;
        }
        if (Array.isArray(x) && Array.isArray(y) && x.length == y.length) {
            for (let i = 0; i < x.length; i++) {
                if (!this.isEqual(x[i], y[i])) {
                    return false;
                }
            }
            return true;
        }
        if (typeof x == "number" && typeof y == "number" && (Math.abs(x - y) <= POGR)) {
            return true;
        }
        return false;
    }
    
    setSosedi(sosedi) {
        this.innerSosedi = [];
        this.outerSosedi = [];
        let thisInnerSosedi = this.innerSosedi,
            thisOuterSosed = this.outerSosedi;
        sosedi.forEach(function(item1) {
            item1.forEach(function(item2, i2) {
                item2.forEach(function(item3) {
                    if (item3 !== null) {
                        if (i2 > 0) {
                            thisInnerSosedi.push(item3);
                        } else {
                            thisOuterSosed.push(item3);
                        }
                    }
                });
            });
        });
        this.logger.debug("sosedi (outer;inner) " + this.id + ": " + this.outerSosedi + "; " + this.innerSosedi);
    }
    
    calculate() {
        let result = true;
        // проходим по каждому отельному региону подразделения
        for (let iObj = 0; iObj < this.coordinates.length; iObj++) {
            this.matrica[iObj] = [];
            let pathsObj = [];
            for (let iGr = 0; iGr < this.coordinates[iObj].length; iGr++) {
                this.matrica[iObj][iGr] = [];
                this.buildMatrica(iObj, iGr);
                this.updateMatrica(iObj, iGr);
                pathsObj.push(this.calcMatrica(iObj, iGr)); // добавляем границу
            }
            this.path.push(pathsObj);
        }
		if (this.checkCountBorders != this.checkCurCountBorders) {
            console.warn("error: Обнаружено расхождение количества границ: ожидалось = " + this.checkCountBorders + "; рез = " + this.checkCurCountBorders + " (ivr: " + this.id + ")");
            this.logger.info("error: Обнаружено расхождение координат: исх = " + this.checkCountBorders + "; рез = " + this.checkCurCountBorders + " (ivr: " + this.id + ")");
            result = false;
        }
        return result;
    }
    
    buildMatrica(iObj, iGr) {
        let iMatrica = [];
        this.matrica[iObj][iGr] = iMatrica;
        // берем внешнюю границу (массив координат / way) ([[x, y]+]) текущего региона
        let granica = this.coordinates[iObj][iGr];
        //console.log("  " + this.id + ": object № " + (iObj + 1) + "/" + this.coordinates.length + "; borders № " + (iGr + 1) + "/" + this.coordinates[iObj].length + "; count coordinates: " + granica.length);
        this.logger.info("  " + this.id + ": object № " + (iObj + 1) + "/" + this.coordinates.length + "; borders № " + (iGr + 1) + "/" + this.coordinates[iObj].length + "; count coordinates: " + granica.length);
        let iCrd = 0;
        let curIndex = -1;
        // проходим по всем состовляющим (координата / way) внешней границы текущего региона текущего подразделения
        while(iCrd < granica.length) {
            let coord = granica[iCrd]; // текущая состовляющая границы (координата точки - массив 2-х чисел / число) ([x, y] / number)
            if (typeof coord == "number") { // текущая состовляющая граница является путём
                if (curIndex >= 0 && iMatrica[curIndex].sosed == null) { 
                    this.logger.debug("      obj:         iObj:  " + iObj + "; iGr:  " + iGr + "; range:  [ " + iMatrica[curIndex].firstPosition + " .. " + iMatrica[curIndex].lastPosition + " ]");
                    this.logger.debug("      coord:     [ " + iMatrica[curIndex].coordinates[0] + " ] .. [ " + iMatrica[curIndex].coordinates[iMatrica[curIndex].coordinates.length - 1] + " ]");
                }
                let s = (this.globalData.pairsWay[Math.abs(coord)][0] == this.id) ? this.globalData.pairsWay[Math.abs(coord)][1] : this.globalData.pairsWay[Math.abs(coord)][0];
                iMatrica[++curIndex] = new PartBorders(this.id, coord, iObj, iGr, iCrd, iCrd, s, null, null, null, null, (coord < 0));
                this.logger.debug("      ------------------------------ curIndex: " + curIndex);
                this.logger.debug("      sosed (" + s + "): curIndex: " + curIndex + "; iCrd: " + iCrd + "; way: " + coord);
            } else if (Array.isArray(coord)) { // текущая состовляющая граница является координатой
                coord[0] = Math.floor(coord[0] * MULTIPLIER_TO_INT) / MULTIPLIER_TO_INT;
                coord[1] = Math.floor(coord[1] * MULTIPLIER_TO_INT) / MULTIPLIER_TO_INT;
                // ищем соседа и первую общую координату
                let [isFind = false, sosed = null, iSObj = null, iSGr = null, iSCrd = null, isRev = false] =
                        this.seachCommonSosed(iObj, iGr, iCrd, coord);
                if (isFind) { // нашли соседа
                    if (curIndex >= 0 && iMatrica[curIndex].sosed == null) {  // переход со свободной границы (null)
                        if (iMatrica[curIndex].coordinates.length > 1) {
                            iMatrica[curIndex].coordinates.push(coord);
                            iMatrica[curIndex].lastPosition = iCrd;
                        }
                        this.logger.debug("      obj:         iObj:  " + iObj + "; iGr:  " + iGr + "; range:  [ " + iMatrica[curIndex].firstPosition + " .. " + iMatrica[curIndex].lastPosition + " ]");
                        this.logger.debug("      coord:     [ " + iMatrica[curIndex].coordinates[0] + " ] .. [ " + iMatrica[curIndex].coordinates[iMatrica[curIndex].coordinates.length - 1] + " ]");
                    }
                    iMatrica[++curIndex] = new PartBorders(this.id, [], iObj, iGr, iCrd, iCrd);
                    iMatrica[curIndex].sosed = sosed;
                    iMatrica[curIndex].iSObj = iSObj;
                    iMatrica[curIndex].iSGr = iSGr;
                    iMatrica[curIndex].sFirstPosition = iSCrd;
                    iMatrica[curIndex].sLastPosition = iSCrd;
                    iMatrica[curIndex].isReverse = isRev;
                    // нашли общую вершину, ищем общий участок границ
                    if (this.seachCommonBorder(iObj, iGr, curIndex)) {
                        iCrd = iMatrica[curIndex].lastPosition;
                        if (iCrd < granica.length - 1 && Array.isArray(granica[iCrd + 1])) {
                            iCrd--;
                        }
                    }
                    this.logger.debug("      ------------------------------ curIndex: " + curIndex);
                    this.logger.debug("      obj:         iObj:  " + iObj + "; iGr:  " + iGr + "; range:  [ " + iMatrica[curIndex].firstPosition + " .. " + iMatrica[curIndex].lastPosition + " ]");
                    this.logger.debug("      sosed (" + iMatrica[curIndex].sosed + "): iSObj: " + iMatrica[curIndex].iSObj + "; iSGr: " + iMatrica[curIndex].iSGr
                         + "; sRange: [ " + (iMatrica[curIndex].isReverse ? iMatrica[curIndex].sLastPosition : iMatrica[curIndex].sFirstPosition) + " .. " + (iMatrica[curIndex].isReverse ? iMatrica[curIndex].sFirstPosition : iMatrica[curIndex].sLastPosition) + " ]");
                    this.logger.debug("      coord:       [ " + iMatrica[curIndex].coordinates[0] + " ] .. [ " + iMatrica[curIndex].coordinates[iMatrica[curIndex].coordinates.length - 1] + " ]");
                } else { // не нашли соседа
                    if (curIndex < 0 || iMatrica[curIndex].sosed != null) {
                        // инициализируем начало нового пути (null)
                        iMatrica[++curIndex] = new PartBorders(this.id, [], iObj, iGr, iCrd, iCrd);
                        this.logger.debug("      ------------------------------ curIndex: " + curIndex);
                    }
                    iMatrica[curIndex].coordinates.push(coord);
                    iMatrica[curIndex].lastPosition = iCrd;
                    if (iCrd == granica.length - 1) {
                        this.logger.debug("      obj:         iObj:  " + iObj + "; iGr:  " + iGr + "; range:  [ " + iMatrica[curIndex].firstPosition + " .. " + iMatrica[curIndex].lastPosition + " ]");
                        this.logger.debug("      coord:     [ " + iMatrica[curIndex].coordinates[0] + " ] .. [ " + iMatrica[curIndex].coordinates[iMatrica[curIndex].coordinates.length - 1] + " ]");
                    }
                }
            }
            iCrd++;
        }
    }
    
    seachCommonSosed(iObj, iGr, iCrd, coord) {
        // ищем соседа и первую общую координату
        let isFind = false;
        let result = [isFind, null, null, null, null, null],
            sosedi = iGr ? this.innerSosedi : this.outerSosedi;
        // проходим по всем соседям
        for (let i = 0; i < sosedi.length; i++) {
            let sosed = +sosedi[i];
            let isDirectionRev = (sosed < 0);
            sosed = Math.abs(sosed);
            if (isFind || ~this.globalData.finishedPodr.indexOf(sosed) || this.globalData.IVDIVO[sosed] == undefined) {
                continue;
            }
            if (this.sosedLastIndex[sosed] === undefined) {
                this.sosedLastIndex[sosed] = {};
            }
            // проходим по всем регионам соседа
            for (let iSObj = 0; iSObj < this.globalData.IVDIVO[sosed].coordinates.length; iSObj++) {
                // sObj - массив границ iSObj-го объекта соседа sosed ([[[x, y]+]+])
                let sObj = this.globalData.IVDIVO[sosed].coordinates[iSObj];
                if (isFind) {
                    break;
                }
                if (this.sosedLastIndex[sosed][iSObj] === undefined) {
                    this.sosedLastIndex[sosed][iSObj] = {};
                }
                // проходим по всем границам соседа 
                for (let iSGr = 0; iSGr < sObj.length; iSGr++) {
                    let sGranica = sObj[iSGr];
                    // sGranica - массив определенных way (числа) и координат вершин (массивы) ([[x, y]+])
                    // iSGr-й границы (0 - внешней, остальные - внутринней) iSObj-го объекта
                    if (isFind) {
                        break;
                    }
                    if (this.sosedLastIndex[sosed][iSObj][iSGr] === undefined) {
                        this.sosedLastIndex[sosed][iSObj][iSGr] = isDirectionRev ? [ sGranica.length, -1 ] : [ -1, sGranica.length ];
                    }
                    let sl = isDirectionRev ? -1 : 1;
                    let iSCrd = +this.sosedLastIndex[sosed][iSObj][iSGr][0] + sl;
                    let tmp = this.sosedLastIndex[sosed][iSObj][iSGr][0];
                    // проходим по всем состовляющим границы региона соседа
                    for (; iSCrd >=0 && iSCrd < sGranica.length; iSCrd += sl) {
                        if (isFind || this.sosedLastIndex[sosed][iSObj][iSGr][1] == iSCrd) {
                            break;
                        }
                        let sCoord = sGranica[iSCrd];
                        // берем только координаты
                        if (Array.isArray(sCoord) && this.isEqual(coord, sCoord)) {
                            isFind = true;
                            result = [
                                isFind,
                                sosed,
                                iSObj,
                                iSGr,
                                iSCrd,
                                isDirectionRev
                            ];
                            if (this.sosedLastIndex[sosed][iSObj][iSGr][1] == -1 
                                    || this.sosedLastIndex[sosed][iSObj][iSGr][1] == sGranica.length) {
                                this.sosedLastIndex[sosed][iSObj][iSGr][1] = iSCrd;
                            }
                            break;
                        }
                        // если прошли до конца границы, то необходимо повторить сначала (возможно, что граница началась внутри общей)
                        if ((isDirectionRev && iSCrd === 0 && this.sosedLastIndex[sosed][iSObj][iSGr][0] < sGranica.length)
                                || (!isDirectionRev && iSCrd === (sGranica.length - 1) && this.sosedLastIndex[sosed][iSObj][iSGr][0] > -1)
                            ) {
                            this.sosedLastIndex[sosed][iSObj][iSGr][0] = isDirectionRev ? sGranica.length : -1;
                            iSCrd = isDirectionRev ? sGranica.length : -1;
                        }
                    }
                    this.sosedLastIndex[sosed][iSObj][iSGr][0] = tmp;
                }
            }
        }
        return result;
    }
    
    seachCommonBorder(iObj, iGr, curIndex) {
        let result = false;
        let iMatrica = this.matrica[iObj][iGr];
        let granica = this.coordinates[iMatrica[curIndex].iObj][iMatrica[curIndex].iGr];
        let sGranica = this.globalData.IVDIVO[iMatrica[curIndex].sosed].coordinates[iMatrica[curIndex].iSObj][iMatrica[curIndex].iSGr];
        let j = iMatrica[curIndex].firstPosition,
            k = iMatrica[curIndex].sLastPosition,
            sl = iMatrica[curIndex].isReverse ? -1 : 1;
        for ( ; j < granica.length && k >= 0 && k < sGranica.length;
                j++, k += sl) {
            if (Array.isArray(sGranica[k]) && this.isEqual(granica[j], sGranica[k])) {
                let newCoord = [
                                 Math.floor(granica[j][0] * MULTIPLIER_TO_INT) / MULTIPLIER_TO_INT,
                                 Math.floor(granica[j][1] * MULTIPLIER_TO_INT) / MULTIPLIER_TO_INT
                               ];
                iMatrica[curIndex].coordinates.push(newCoord);               
                iMatrica[curIndex].lastPosition = j;
                if (iMatrica[curIndex].isReverse) {
                    iMatrica[curIndex].sFirstPosition = k;
                } else {
                    iMatrica[curIndex].sLastPosition = k;
                }
                this.sosedLastIndex[iMatrica[curIndex].sosed][iMatrica[curIndex].iSObj][iMatrica[curIndex].iSGr][0] = k;
                if (k == 0 && iMatrica[curIndex].isReverse) {
                    k = sGranica.length;
                } else if (k == (sGranica.length - 1) && !iMatrica[curIndex].isReverse) {
                    k = -1;
                }
                result = true;
            } else {
                break;
            }
        }
        if (!result) {
            this.logger.debug("      seachCommonBorder (false): j = " + j + ", granica.length = " + granica.length + ", k = " + k + ", sGranica.length = " + sGranica.length + ", sl = " + sl);
        }
        return result;
    }
    
    updateMatrica(iObj, iGr) {
        let logger = this.logger;
        this.logger.debug("      ------------------------------");
        this.logger.debug("      --- befor union ---");
        this.matrica[iObj][iGr].forEach(function(itemTmp, iTmp) {
            logger.debug("      matrica: " + iTmp + " - " + itemTmp);
        });
        let iMatrica = this.matrica[iObj][iGr];
        let last = iMatrica.length - 1;
        // постобработка: если начало границы пришлось на "середину" соседа
        if (last > 0
                && iMatrica[last].sosed == null
                && Array.isArray(iMatrica[last].coordinates)
                && iMatrica[last].coordinates.length == 1
                ) {
            iMatrica.pop();
            last--;
        }
        // объединяем крайние участки, если они имеют одинаковых соседей (или не имеют соседей)
        while (this.isEqual(iMatrica[0].sosed, iMatrica[last].sosed)
                && this.isEqual(iMatrica[0].iSObj, iMatrica[last].iSObj)
                && this.isEqual(iMatrica[0].iSGr, iMatrica[last].iSGr)
                && last > 0) {
            if (this.isEqual(iMatrica[0].coordinates, iMatrica[last].coordinates)) {
                iMatrica.pop();
            } else if (Array.isArray(iMatrica[0].coordinates) && Array.isArray(iMatrica[last].coordinates)) {
                // объединяем координаты
                iMatrica[last].coordinates = iMatrica[last].coordinates.concat(iMatrica[0].coordinates);
                // меняем крайние позицции у соседа
                if (iMatrica[last].sosed != null) {
                    if (iMatrica[last].isReverse) {
                        iMatrica[last].sFirstPosition = iMatrica[0].sFirstPosition;
                    } else {
                        iMatrica[last].sLastPosition = iMatrica[0].sLastPosition;
                    }
                }
                // меняем позиции у границы
                let l = iMatrica[0].coordinates.length - 1;
                iMatrica.forEach(function(itemTmp, iTmp, arrTmp) {
                    if (iTmp > 0) {
                        arrTmp[iTmp].firstPosition -= l;
                        if (iTmp < arrTmp.length - 1) {
                            arrTmp[iTmp].lastPosition -= l;
                        }
                    }
                });
                iMatrica.shift();
            } else {
                break;
            }
            last--;
        }
    }
    
    calcMatrica(iObj, iGr) {
        let logger = this.logger;
        let iMatrica = this.matrica[iObj][iGr];
        let last = iMatrica.length - 1;
        //обрабатываем участки, формируем пути
        let newItem2 = [];
        let ways = this.globalData.ways;
        let numWay = this.globalData.numWay;
        let warn = "";
        for (let j = 0; j <= last; j++) {
            if (typeof iMatrica[j].coordinates == "number") {
                newItem2.push(iMatrica[j].coordinates);
            } else if (iMatrica[j].coordinates.length == 1) {
                warn = warn + "warn: Обнаружена обособленная координата (ivr: " + this.id + "): " + iMatrica[j].firstPosition + " ([" + iMatrica[j].coordinates + "])\r\n";
            } else if (iMatrica[j].coordinates.length > 1) {
                ways[String(++numWay)] = iMatrica[j].coordinates;
                this.globalData.pairsWay[numWay] = [this.id, iMatrica[j].sosed];
                newItem2.push(numWay);
                let sosed = iMatrica[j].sosed;
                if (sosed !== null) {
                    let numWay2 = iMatrica[j].isReverse ? -numWay : numWay;
                    let sCoordinates = this.globalData.IVDIVO[sosed].coordinates[iMatrica[j].iSObj][iMatrica[j].iSGr],
                        sLength = sCoordinates.length,
                        sFirstPosition = iMatrica[j].sFirstPosition,
                        sLastPosition = iMatrica[j].sLastPosition,
                        prevFirstPosition = sFirstPosition == 0 ? sLength - 1 : sFirstPosition - 1,
                        nextFirstPosition = sFirstPosition == sLength - 1 ? 0 : sFirstPosition + 1,
                        next2FirstPosition = nextFirstPosition == sLength - 1 ? 0 : nextFirstPosition + 1,
                        prevLastPosition = sLastPosition == 0 ? sLength - 1 : sLastPosition - 1,
                        nextLastPosition = sLastPosition == sLength - 1 ? 0 : sLastPosition + 1,
                        prevFirstValue = sCoordinates[prevFirstPosition],
                        nextLastValue = sCoordinates[nextLastPosition];
                    let start = undefined,
                        end = undefined;
                    if (nextLastPosition == sFirstPosition) {
                        this.globalData.IVDIVO[sosed].coordinates[iMatrica[j].iSObj][iMatrica[j].iSGr][0] = numWay2;
                        start = 1;
                        end = sLength - 1;
                    } else {
                        // начало
                        if (Array.isArray(prevFirstValue)) {
                            if (iMatrica[j].coordinates.length > 2 || !Array.isArray(nextLastValue)) {
                                this.globalData.IVDIVO[sosed].coordinates[iMatrica[j].iSObj][iMatrica[j].iSGr][nextFirstPosition] = numWay2;
                                start = next2FirstPosition;
                            }
                        } else {
                            this.globalData.IVDIVO[sosed].coordinates[iMatrica[j].iSObj][iMatrica[j].iSGr][sFirstPosition] = numWay2;
                            start = nextFirstPosition;
                        }
                        // конец
                        if (Array.isArray(nextLastValue)) {
                            end = prevLastPosition;
                        } else {
                            end = sLastPosition;
                        }
                    }
                    if (start != undefined && end != undefined) {
                        let c = start,
                            f = (end == sLength - 1) ? 0 : end + 1;
                        while (c != f) {
                            this.globalData.IVDIVO[sosed].coordinates[iMatrica[j].iSObj][iMatrica[j].iSGr][c] = null;
                            c = (c == sLength - 1) ? 0 : c + 1;
                        }
                    }
                }
            }
        }
        this.globalData.ways = ways;
        this.globalData.numWay = numWay;

        this.logger.info("    ---------- borders: ---------- ");
        this.matrica[iObj][iGr].forEach(function(itemTmp, iTmp, arrTmp) {
            let type, value;
            if (typeof itemTmp.coordinates == "number") {
                type = "n";
                value = itemTmp.coordinates + ", count: 1";
            } else if (itemTmp.coordinates.length == 1) {
                type = "c";
                value = "[" + itemTmp.coordinates + "], count: 1";
            } else {
                type = "w";
                value = "[" + itemTmp.coordinates[0] + "] ... [" + itemTmp.coordinates[itemTmp.coordinates.length - 1] + "], count: " + itemTmp.coordinates.length;
            }
            logger.info("    matrica: " + iTmp + " - (" + type + ") " + itemTmp + " => " + value + "");
        });
        if (warn != "") {
            console.warn(warn);
            this.logger.info(warn);
        }

        this.checkCurCountBorders += newItem2.length;
        return newItem2;
    }
    
    getRegionInfo() {
        return {
            name: this.name,
            index: this.index
        };
    }
    
    getPath() {
        return this.path;
    }

}

geoJSON.features.sort(myLib.compareFeature);

//-------------------------------------------------------
//--------------- 1. Инициализация ----------------------
//-------------------------------------------------------
logger.info("-------------------------------------------------------");
logger.info("-------------------------------------------------------");
logger.info((new Date).toString());
logger.info("-------------------------------------------------------");
logger.info("-------------------------------------------------------");

let result = new Regions();
for(let i in geoJSON.features) {
    let ivr = +geoJSON.features[i].properties.id;
    // ограничиваем перечень обрабатываемых подразделений
    if (strPodr != undefined && strPodr != "" && !~strPodr.indexOf(ivr)) {
         continue;
    }
    globalData.IVDIVO[ivr] = new PodrIVDIVO(ivr, (infoJSON[ivr] == undefined ? ivr : infoJSON[ivr].name),
            geoJSON.features[i].geometry.coordinates, infoJSON[ivr].countBorders, globalData, logger);
    globalData.IVDIVO[ivr].setSosedi((infoJSON[ivr] == undefined ? [[[]]] : infoJSON[ivr].sosedi));
}

//-------------------------------------------------------
//--------- 2. Определение общих границ -----------------
//-------------------------------------------------------

for(let i in geoJSON.features) {
    let ivr = +geoJSON.features[i].properties.id;
    if (globalData.IVDIVO[ivr] === undefined) {
        continue;
    }
    logger.info("-------------------------------------------------------");
    logger.info("" + ivr + ": " + geoJSON.features[i].properties.name);
    isError = !globalData.IVDIVO[ivr].calculate() || isError;
    
    result.regions[prefix + String(ivr)] = globalData.IVDIVO[ivr].getRegionInfo();
    result.paths[prefix + String(ivr)] = globalData.IVDIVO[ivr].getPath();
    
    globalData.finishedPodr.push(ivr);
}

//-------------------------------------------------------
//--------- 3. Кодирование общих границ -----------------
//-------------------------------------------------------

for (curWay = 1; curWay <= globalData.numWay; curWay++) {
    logger.info("-------------------------------------------------------");
    logger.info("way: " + curWay + "/" + globalData.numWay + "; length: " + globalData.ways[curWay].length);
    logger.debug("      way: [" + globalData.ways[curWay][0] + "] ... [" + globalData.ways[curWay][globalData.ways[curWay].length - 1] + "]");
    // все состовляюще координаты точек преображаем и помещаем в один массив
    let totalArr = [];
    let bounds = [ 
                   [ globalData.ways[curWay][0][0], globalData.ways[curWay][0][1] ], // min
                   [ globalData.ways[curWay][0][0], globalData.ways[curWay][0][1] ]  // max
                 ];
    bounds = globalData.ways[curWay].reduce(function(prevValue, curItem, i, arr) {
        return [
                [ Math.min(prevValue[0][0], curItem[0]), Math.min(prevValue[0][1], curItem[1]) ],
                [ Math.max(prevValue[1][0], curItem[0]), Math.max(prevValue[1][1], curItem[1]) ]
               ];
    }, bounds);
    let dimension = [bounds[1][0] - bounds[0][0], bounds[1][1] - bounds[0][1]];
    logger.info("bounds: [" + bounds[0] + "], [" + bounds[1] + "]; dimension: x = " + Math.floor(dimension[0] * MULTIPLIER_TO_INT) / MULTIPLIER_TO_INT + ", y = " + Math.floor(dimension[1] * MULTIPLIER_TO_INT) / MULTIPLIER_TO_INT);
    let fx = dimension[0] / MULTIPLIER_POZ,
        fy = dimension[1] / MULTIPLIER_POZ;
    totalArr.push(bounds[0][0] * MULTIPLIER_TO_INT ^ 0);
    totalArr.push(bounds[0][1] * MULTIPLIER_TO_INT ^ 0);
    totalArr.push(bounds[1][0] * MULTIPLIER_TO_INT ^ 0);
    totalArr.push(bounds[1][1] * MULTIPLIER_TO_INT ^ 0);
    globalData.ways[curWay].forEach(function(coord, iCrd, arrCrd) {
        let x = Math.floor((coord[0] - bounds[0][0]) / fx);
        let y = Math.floor((coord[1] - bounds[0][1]) / fy);
        totalArr.push(x);
        totalArr.push(y);
    });

    // кодируем преобразованные состовляюще координаты точек
    let str = myLib.codeByteVector(totalArr[0], 4) + myLib.codeByteVector(totalArr[1], 4);
    str += myLib.codeByteVector(totalArr[2], 4) + myLib.codeByteVector(totalArr[3], 4);
    str = totalArr.slice(4).reduce(function(point, current) {
        return (point + myLib.codeByteVector(current, FRACTION));
    }, str);

    result.ways[String(curWay)] = myLib.toBase64(str);
    logger.debug("      way = " + result.ways[String(curWay)]);

}

logger.info("-------------------------------------------------------");

let resultJSON = JSON.stringify(result, "", 2);

if (isError) {
    console.warn("При выполненнии возникли ошибки!!!");
    logger.info("При выполненнии возникли ошибки!!!");
}

logger.info("-------------------------------------------------------");
logger.info("");

fs.writeFileSync("data/out/geo.json", resultJSON);