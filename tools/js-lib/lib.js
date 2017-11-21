function exportJSON(data, fileName) {
    var json = JSON.stringify(data, "", 2);
    var blob = new Blob([json], {type: "application/json"});
    var url  = URL.createObjectURL(blob);

    var a = document.createElement('a');
    a.download    = fileName + ".json";
    a.href        = url;
    a.textContent = "Download " + fileName + ".json";

    document.getElementById('geoJSONData').appendChild(a);
};

function showAllRegions(map, regionSearch, level, options) {
    osmeRegions.geoJSON(regionSearch, {lang: 'ru', quality: 2}, function (result) {
        var collection = osmeRegions.toGoogle(result, google.maps);
        collection.setStyles(function(object) {
            return options;
        });
        collection.add(map);
        exportJSON(result, "geoJSON" + level);
    });
};

function showRegion(map, regionSearch, regions, level, options) {
    osmeRegions.geoJSON(regionSearch, {lang: 'ru', quality: 2, postFilter: function(reg) { return ~regions.indexOf(reg.osmId); } }, function (result) {
        var collection = osmeRegions.toGoogle(result, google.maps);
        collection.setStyles(function(object) {
            return options;
        });
        collection.add(map);
        exportJSON(result, "geoJSON" + level);
    });
};

function showRegionRecombine(map, regionSearch, regions, level, options) {
    osmeRegions.geoJSON(regionSearch, {lang: 'ru', quality: 2}, function (data, pureData) {
        let coords=osmeRegions.recombine(pureData, {
            filter: function (reg) {
                return ~regions.indexOf(reg.osmId);
            }
        });
        let result = {
            type: "FeatureCollection",
            features: [{
                type: "Feature",
                geometry: coords
            }]
        };
        let collection = osmeRegions.toGoogle(result, google.maps);
        collection.setStyles(function(object) {
            return options;
        });
        collection.add(map);
        exportJSON(result, "geoJSON" + level);
    });
};