<?php
    $m = $_GET['m'];
    $rs = $_GET['rs'];
    $rf = $_GET['rf'];
    $ivr = $_GET['ivr'];
    echo "Входные данные: режим (m) = ".$m; echo "; в/с регион (rs) = ".$rs; echo "; регион(-ы) (rf) = ".$rf; echo "; ИВР (ivr) = ".$ivr;
?>

<!DOCTYPE html>
<html>
    <head>
        <title>Построитель территорий подразделений ИВДИВО</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style type="text/css">
            html, body { height: 100%; margin: 0; padding: 0; }
            #geoJSONData { height: 10%; }
            #content { height: 85%; }
        </style>
        <script src="js-lib/lib.js"></script>
        <script src="js-lib/regions.js"></script>
        <script
            src="https://maps.googleapis.com/maps/api/js?v=3.exp&key=[key]">
        </script>
    </head>
    <body>
        <div id="content"></div>
        <div id="geoJSONData"></div>
        <script>

        // Создание карты >>
        var mapOptions = {
            zoom: 4,
            center: {lat: 55.755833, lng: 37.617778}
        };

        var optDef = {
            strokeOpacity: 0.2,
            fillColor: '#FF0000',
            fillOpacity: 0.35
        };

        var map = new google.maps.Map(document.getElementById("content"), mapOptions);
        // << Создание карты

        <?php if ($m == 0) { ?>
        showAllRegions(map, "<?php echo $rs; ?>", "<?php echo $ivr; ?>", optDef);
        <?php } else if ($m == 1) { ?>
        showRegion(map, "<?php echo $rs; ?>", "<?php echo $rf; ?>", "<?php echo $ivr; ?>", optDef);
        <?php } else if ($m == 2) { ?>
        showRegionRecombine(map, "<?php echo $rs; ?>", "<?php echo $rf; ?>", "<?php echo $ivr; ?>", optDef);
        <?php } ?>
        
    </script>
    </body>
</html>