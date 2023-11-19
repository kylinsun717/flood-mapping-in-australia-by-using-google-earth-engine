var dataset = ee.FeatureCollection("WWF/HydroSHEDS/v1/Basins/hybas_5");

Map.addLayer(dataset, {}, "Basins");

var inspector = ui.Panel([ui.Label('Click on the map to select catchment area')]);
Map.add(inspector);


var catchment_id = 5050533450;
var areaOfInterest = ee.FeatureCollection('WWF/HydroSHEDS/v1/Basins/hybas_5').filter(ee.Filter.eq('HYBAS_ID', catchment_id));
console.log("Default catchment id: " + catchment_id)


Map.onClick(function(coords) {
  // Show the loading label.
  inspector.widgets().set(0, ui.Label({
    value: 'Loading...',
    style: {color: 'gray'}
  }));

  var click_point = ee.Geometry.Point(coords.lon, coords.lat);

  var list = dataset.reduceColumns(ee.Reducer.toList(), ['HYBAS_ID']).get('list');

  var shp_lst = dataset.toList(dataset.size());
  
  var retIdx = shp_lst.map(function (ele) {
  
  var idx = shp_lst.indexOf(ele);
  
    return ee.Algorithms.If(ee.Feature(ele).intersects(click_point), idx, 0);
  
  }).removeAll([0]);

  retIdx = retIdx.get(0).getInfo();
  
  var name = ee.List(list).get(retIdx);
  console.log("Your selected area's catchment id: ")
  console.log(name)
  console.log("Ready to apply filter")
  catchment_id = name
  areaOfInterest = ee.FeatureCollection('WWF/HydroSHEDS/v1/Basins/hybas_5').filter(ee.Filter.eq('HYBAS_ID', catchment_id));
  inspector.widgets().set(0, ui.Label({value: 'Long: ' 
                                       + parseFloat(coords.lon).toFixed(2) 
                                       + ' Lat: '+ parseFloat(coords.lat).toFixed(2)  + ' '
                                       + 'ID: '+ name.getInfo()
  }));
  //inspector.clear();
   
});


 // VIIRS Cloud Mask //
function mask2clouds(image){
  var qa = image.select('QF1')
  
  var cloudMaskQuality = 3 << 0-1
  var cloudDdetect = 3 << 2-3
  var Day_Night = 3 << 4
  var LowSunMask = 0 << 5
  var SunGlint = 0 << 6-7

  var mask = qa.bitwiseAnd(cloudMaskQuality).eq(0)
              .and(qa.bitwiseAnd(cloudDdetect).eq(0))
              .and(qa.bitwiseAnd(Day_Night).eq(0))
              .and(qa.bitwiseAnd(LowSunMask).eq(0))
              .and(qa.bitwiseAnd(SunGlint).eq(0))

  return image.updateMask(mask)
}
    
// MODIS CLOUD MASK STARTS//
// helper function to extract the QA bits
function getQABits(image, start, end, newName) {
  // Compute the bits we need to extract.
  var pattern = 0;
  for (var i = start; i <= end; i++) {
  pattern += Math.pow(2, i);
  }
  // Return a single band image of the extracted QA bits, giving the band
  // a new name.
  return image.select([0], [newName])
  .bitwiseAnd(pattern)
  .rightShift(start);
}

// A function to mask out cloudy pixels.
function maskQuality(image) {
 // Select the QA band.
 var QA = image.select('StateQA');
 // Get the internal_cloud_algorithm_flag bit.
 var internalQuality = getQABits(QA,8, 13, 'internal_quality_flag');
 // Return an image masking out cloudy areas.
 return image.updateMask(internalQuality.eq(0));
}

var app = {};

var removeLayer = function(name) {
  var layers = Map.layers()
  // list of layers names
  var names = []
  layers.forEach(function(lay) {
    var lay_name = lay.getName()
    names.push(lay_name)
  })
  // get index
  var index = names.indexOf(name)
  if (index > -1) {
    // if name in names
    var layer = layers.get(index)
    Map.remove(layer)
  }
}



var globalNdwival = 0

var mappedImageID = {}
  
// Creates the UI panels
app.createPanels = function() {

  // The introduction section
  app.intro = {
    panel: ui.Panel([
      ui.Label({
        value: 'Flood Mapping',
        style: {fontWeight: 'bold', fontSize: '24px', margin: '10px 5px'}
      }),
      ui.Label('Users can adjust the following parameters to customize the flood mapping for your desired location.')
    ])
  };

  // e collection filter controls
  app.filters = {
    mapCenter: ui.Checkbox({label: 'Filter to map center', value: true}),
    startDate: ui.Textbox('YYYY-MM-DD', '2022-11-01'),
    endDate: ui.Textbox('YYYY-MM-DD', '2022-11-30'),
    applyButton: ui.Button('Apply filters', app.applyFilters),
    applyDateButton: ui.Button('Apply date', app.applyDate),
    loadingLabel: ui.Label({
      value: 'Loading...',
      style: {stretch: 'vertical', color: 'gray', shown: false}
    }),
    loadingLabel1: ui.Label({
      value: 'Loading...',
      style: {stretch: 'vertical', color: 'gray', shown: false}
    })
  };

  // The image picker section
  app.satellite = {
    // Create a select with a function that reacts to the "change" event
    select: ui.Select({
      placeholder: 'Select satellite',
    }),
    // Create a button that centers the map on a given object
    centerButton: ui.Button('Center on map', function() {
      Map.centerObject(Map.layers().get(0).get('eeObject'));
    })
  };

  var satellitesId = ["Sentinel2 Image", "VIIRS Image", "MODIS Image", "Landsat Image"];
  app.satellite.select.items().reset(satellitesId);
  // Default the image picker to the first id.
  app.satellite.select.setValue(app.satellite.select.items().get(0));
  
  // The panel for the filter control widgets
  app.filters.panel = ui.Panel({
    widgets: [
      ui.Label('1) Select time and satellite', {fontWeight: 'bold'}),
      ui.Label('Start date', app.HELPER_TEXT_STYLE), app.filters.startDate,
      ui.Label('End date', app.HELPER_TEXT_STYLE), app.filters.endDate,
      ui.Panel([
        app.filters.applyDateButton,
        app.filters.loadingLabel1
      ], ui.Panel.Layout.flow('horizontal')),
      app.filters.mapCenter,
        ui.Panel([
        app.satellite.select,
        app.satellite.centerButton
      ], ui.Panel.Layout.flow('horizontal')),
            ui.Panel([
        app.filters.applyButton,
        app.filters.loadingLabel
      ], ui.Panel.Layout.flow('horizontal')),
    ],
    style: app.SECTION_STYLE
  });

  // The image picker section
  app.picker = {
    // Create a select with a function that reacts to the "change" event
    select: ui.Select({
      placeholder: 'Select an ',
      onChange: app.refreshMapLayer
    }),
    // Create a button that centers the map on a given object
    centerButton: ui.Button('Center on map', function() {
      Map.centerObject(Map.layers().get(0).get('eeObject'));
    })
  };
  
  // The panel for the picker section with corresponding widgets
  app.picker.panel = ui.Panel({
    widgets: [
      ui.Label('3) Select an image', {fontWeight: 'bold'}),
      ui.Panel([
        app.picker.select,
        app.picker.centerButton
      ], ui.Panel.Layout.flow('horizontal'))
    ],
    style: app.SECTION_STYLE
  });

  // The visualization section
  app.vis = {
    label: ui.Label(),
    // Create a select with a function that reacts to the "change" event
    select: ui.Select({
      items: Object.keys(app.VIS_OPTIONS),
      onChange: function() {
        // Update the label's value with the select's description
        var option = app.VIS_OPTIONS[app.vis.select.getValue()];
        app.vis.label.setValue(option.description);
        // Refresh the map layer.
        app.refreshMapLayer();
      }
    })
  };

  // The panel for the visualization section with corresponding widgets
  app.vis.panel = ui.Panel({
    widgets: [
      ui.Label('4) Select a visualisation', {fontWeight: 'bold'}),
      app.vis.select,
      app.vis.label
    ],
    style: app.SECTION_STYLE
  });
  
  app.threshold = {
    defaultThreshold: ui.Textbox('0', '0'),
    applyThresholdButton: ui.Button('Apply threshold', app.applyThreshold),
  };
  
  app.threshold.panel = ui.Panel({
    widgets: [
      ui.Label('2) NDWI threshold adjustment', {fontWeight: 'bold'}),
      ui.Label('threshold', app.HELPER_TEXT_STYLE), app.threshold.defaultThreshold,
      ui.Panel([
        app.threshold.applyThresholdButton,
      ], ui.Panel.Layout.flow('horizontal')),
    ],
    style: app.SECTION_STYLE
  });

  // Default the select to the first value.
  app.vis.select.setValue(app.vis.select.items().get(0));
  
  
  // The export section
  app.export = {
    button: ui.Button({
      label: 'Export the current image to Drive',
      // React to the button's click event.
      onClick: function() {
        // Select the full image id.
        var imageIdTrailer = app.picker.select.getValue();
        var realID = mappedImageID[imageIdTrailer]
        var imageId = app.COLLECTION_ID + '/' + realID;
        // Get the visualization options.
        var visOption = app.VIS_OPTIONS[app.vis.select.getValue()];
        // Export the image to Drive.
        var geom1 = ee.Geometry.BBox(143.00, -32.86, 145.97, -29.21);
        var bands = ['B4', 'B3', 'B2']
        var ndwibands = ['B4', 'B3', 'B2']
        if (app.COLLECTION_ID == "NOAA/VIIRS/001/VNP09GA") {
          if (visOption.name == "NDWI"){
            bands = ['M4', 'M7']
          }else{
            bands = ['M5', 'M4', 'M3']
          }
          // geom1 = clickpoint_geom;
          // console.log(clickpoint_geom);
        } 
        else if (app.COLLECTION_ID == "MODIS/061/MCD43A4") {
          bands = ['Nadir_Reflectance_Band1', 'Nadir_Reflectance_Band4', 'Nadir_Reflectance_Band3']
        } 
        console.log(bands);
        var outputTiffImageResponse = outputTiffImage();
        console.log(imageId);
        imageId = outputTiffImageResponse[0];
        if (visOption.name == 'NDWI'){
          bands = outputTiffImageResponse[1]["palette"]
        }
        else{
          bands = outputTiffImageResponse[1]["bands"]
        }
        console.log(imageId);
        console.log(bands);
        Export.image.toDrive({
          image: ee.Image(imageId).select(bands),
          region: geom1,
          description: app.satellite.select.getValue() + '-' + imageIdTrailer,
        });
      }
    })
  };

  // The panel for the export section with corresponding widgets
  app.export.panel = ui.Panel({
    widgets: [
      ui.Label('5) Start an export', {fontWeight: 'bold'}),
      app.export.button
    ],
    style: app.SECTION_STYLE
  });
};

// Creates the app helper functions
app.createHelpers = function() {
  /**
  * Enables or disables loading mode.
  * @param {boolean} enabled Whether loading mode is enabled.
  */
  app.setLoadingMode = function(enabled) {
    // Set the loading label visibility to the enabled mode.
    app.filters.loadingLabel.style().set('shown', enabled);
    // Set each of the widgets to the given enabled mode.
    var loadDependentWidgets = [
      app.vis.select,
      app.filters.startDate,
      app.filters.endDate,
      app.filters.applyDateButton,
      app.filters.applyButton,
      app.filters.mapCenter,
      app.threshold.applyThresholdButton,
      app.picker.select,
      app.picker.centerButton,
      app.export.button
    ];
    loadDependentWidgets.forEach(function(widget) {
      widget.setDisabled(enabled);
    });
  };

  var satellitesId = ["Sentinel2 Image", "VIIRS Image", "MODIS Image", "Landsat Image"];
  
  // Applies the selection filters currently selected in the UI
  app.applyFilters = function() {
    app.setLoadingMode(true);
    Map.clear()
    var satellite = app.satellite.select.getValue();
    var mappedSatellite = 'COPERNICUS/S2'
    if (satellite == 'VIIRS Image') {
      mappedSatellite = 'NOAA/VIIRS/001/VNP09GA'
    } else if (satellite == 'MODIS Image'){
      mappedSatellite = 'MODIS/061/MCD43A4'
    } else if (satellite == 'Landsat Image'){
      mappedSatellite = 'LANDSAT/LC08/C02/T1'
    }
      
    app.COLLECTION_ID = mappedSatellite;
  
    // Set filter variables.
    var start = app.filters.startDate.getValue();
    if (start) start = ee.Date(start);
    var end = app.filters.endDate.getValue();
    if (end) end = ee.Date(end);
    
    var filtered = ee.ImageCollection(mappedSatellite)
              .filter(ee.Filter.date(start, end))
              .filterBounds(areaOfInterest);
    
    // Get the list of computed ids.
    var computedIds = filtered
        .reduceColumns(ee.Reducer.toList(), ['system:index'])
        .get('list');
        
    print(computedIds);    
        
    computedIds.evaluate(function(ids) {
      mappedImageID = {}
      // Update the image picker with the given list of ids.
      app.setLoadingMode(false);
      
      if (app.COLLECTION_ID == "COPERNICUS/S2") {
        ids = ids.map(function(e) {
          var final = "S2-" + e.slice(0, 8);
          mappedImageID[final] = e
          return final;
        });
      }
      else if (app.COLLECTION_ID == 'NOAA/VIIRS/001/VNP09GA'){
        ids = ids.map(function(e) {
          var final = "VIIRS-" + e.slice(0, 10);
          mappedImageID[final] = e
          return final;
        });
      }
      else if (app.COLLECTION_ID == 'MODIS/061/MCD43A4'){
        ids = ids.map(function(e) {
          var final = "MODIS-" + e.slice(0, 10);
          mappedImageID[final] = e
          return final;
        });
      }
      else if (app.COLLECTION_ID == 'LANDSAT/LC08/C02/T1'){
        ids = ids.map(function(e) {
          var final = "L8-" + e.slice(12, 20);
          mappedImageID[final] = e
          return final;
        });
      }
      print(mappedImageID)
      
      app.picker.select.items().reset(ids);
      // Default the image picker to the first id.
      app.picker.select.setValue(app.picker.select.items().get(0));
    });
    
    var sentinelImageCollection = ee.ImageCollection('COPERNICUS/S2')
                  .filterBounds(areaOfInterest)
                  .filterDate(start, end);
    var VIIRSImageCollection = ee.ImageCollection('NOAA/VIIRS/001/VNP09GA')
                      .filter(ee.Filter.date(start, end))
                      .filterBounds(areaOfInterest).map(mask2clouds);
    var MODISImageCollection = ee.ImageCollection('MODIS/061/MCD43A4')
                      .filter(ee.Filter.date(start, end))
                      .filterBounds(areaOfInterest);
    var L8ImageCollection = ee.ImageCollection('LANDSAT/LC08/C02/T1')
                      .filter(ee.Filter.date(start, end))
                      .filterBounds(areaOfInterest);
    var L8cloudImageCollection = ee.ImageCollection('LANDSAT/LC08/C02/T1')
                      .filterBounds(areaOfInterest);                  
                      
    
      
    if (satellite == "Sentinel2 Image"){
      var RGB_sentinelImage = 
          sentinelImageCollection.filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',15)).mean()
          .clip(areaOfInterest);
          
      var NDWI_sentinelImage = 
          sentinelImageCollection.filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',15)).mean()
          .clip(areaOfInterest);
          
        // Visualize using RGB
      Map.addLayer(
        RGB_sentinelImage,
        {min: 0.0, max: 5000, bands: ['B4', 'B3', 'B2']},
        'RGB');
          
      var ndwi = NDWI_sentinelImage.normalizedDifference(['B3', 'B8']).rename('NDWI');
      Map.addLayer(
        ndwi,
        {min: -1, max: 0.5,palette: ['red', 'yellow', 'green', 'cyan', 'blue']},
        'NDWI');
        
      // Create NDWI mask  
      var ndwiThreshold = ndwi.gte(globalNdwival);
      var ndwiMask = ndwiThreshold.updateMask(ndwiThreshold);
      
      Map.addLayer(ndwiMask, {palette: ['blue']}, 'NDWI Mask');
      Map.add(legendPanel);
    }    
    else if (satellite == "VIIRS Image"){
  
      // Select bands //                  
      var VIIRSImage = 
          VIIRSImageCollection.median()
          .clip(areaOfInterest);
      var NDWI_VIIRSImage = 
          VIIRSImageCollection
          .mean()
          .clip(areaOfInterest);
  
      // Visualise with RGB //
      Map.addLayer(
          VIIRSImage,
          {min: 0.0, max: 3000, bands: ['M5', 'M4', 'M3']},
          'RGB');
    
      var ndwi =
        NDWI_VIIRSImage.normalizedDifference(['M4', 'M7']).rename('NDWI');
      Map.addLayer(
          ndwi,
          {min: -1, max: 0.5,palette: ['red', 'yellow', 'green', 'cyan', 'blue']},
          'NDWI');
      // Create NDWI mask  
      var ndwiThreshold = ndwi.gte(globalNdwival);
      var ndwiMask = ndwiThreshold.updateMask(ndwiThreshold);
      
      Map.addLayer(ndwiMask, {palette: ['blue']}, 'NDWI Mask');
      Map.add(legendPanel);
    }    
    else if (satellite == "MODIS Image"){
      var modisImage = 
      MODISImageCollection.mean().clip(areaOfInterest);
      
      var ndwi = modisImage.normalizedDifference(['Nadir_Reflectance_Band2', 'Nadir_Reflectance_Band6']).rename('NDWI');
      Map.addLayer(
          ndwi,
          {min: -1, max: 0.5,palette: ['red', 'yellow', 'green', 'cyan', 'blue']},
          'NDWI');

  
      // Visualize using RGB
      Map.addLayer(
          modisImage,
          {min: 0, max: 4000, gamma:1.4, bands: ['Nadir_Reflectance_Band1','Nadir_Reflectance_Band4','Nadir_Reflectance_Band3']},'RGB');
      
      // Create NDWI mask  
      var ndwiThreshold = ndwi.gte(globalNdwival);
      var ndwiMask = ndwiThreshold.updateMask(ndwiThreshold);
      
      Map.addLayer(ndwiMask, {palette: ['blue']}, 'NDWI Mask');
      Map.add(legendPanel);
    }
    
    else if (satellite == "Landsat Image"){
       
      var L8_pre_Image = ee.Algorithms.Landsat.simpleComposite({
        collection: L8cloudImageCollection.filterDate(start, end),
        asFloat: true
      }).clip(areaOfInterest)
      Map.addLayer(
        L8_pre_Image,
        {min: 0.0, max: 0.3, bands: ['B4', 'B3', 'B2']},
        'Landsat 8 RGB images');
      // Calculate NDWI //
      var pre_ndwi =
          L8_pre_Image.normalizedDifference(['B3', 'B5']).rename('NDWI');
      Map.addLayer(
          pre_ndwi,
          {min: -1, max: 0.5,palette: ['red', 'yellow', 'green', 'cyan', 'blue']},
          'NDWI');
          
      // Create NDWI mask  
      var ndwiThreshold = pre_ndwi.gte(globalNdwival);
      var ndwiMask = ndwiThreshold.updateMask(ndwiThreshold);
      
      Map.addLayer(ndwiMask, {palette: ['blue']}, 'NDWI Mask');
      Map.add(legendPanel);
      }
    else {
      print("wrong input")
    }

    
  }
  
  app.applyThreshold = function() {
    globalNdwival = parseFloat(app.threshold.defaultThreshold.getValue());
    console.log(typeof app.threshold.defaultThreshold.getValue())
    app.applyFilters();
    app.refreshMapLayer();
  }
    
  // Applies date selection currently seleteced in the UI
  app.applyDate = function() {
    app.setLoadingMode(true);
    var filtered = ee.ImageCollection(app.COLLECTION_ID);
  
    // Filter bounds to the map if the checkbox is marked.
    if (app.filters.mapCenter.getValue()) {
      filtered = filtered.filterBounds(Map.getCenter());
    }
  
    // Set filter variables.
    var start = app.filters.startDate.getValue();
    if (start) start = ee.Date(start);
    var end = app.filters.endDate.getValue();
    if (end) end = ee.Date(end);
    if (start) filtered = filtered.filterDate(start, end);
    
    var satellite = app.satellite.select.getValue();
    print(end);
    print(start);
    
    var sentinelImageCollection = ee.ImageCollection('COPERNICUS/S2')
                  .filterBounds(areaOfInterest)
                  .filterDate(start, end);
    var VIIRSImageCollection = ee.ImageCollection('NOAA/VIIRS/001/VNP09GA')
                      .filter(ee.Filter.date(start, end))
                      .filterBounds(areaOfInterest);
    var MODISImageCollection = ee.ImageCollection('MODIS/061/MCD43A4')
                      .filter(ee.Filter.date(start, end))
                      .filterBounds(areaOfInterest);
    var L8ImageCollection = ee.ImageCollection('LANDSAT/LC08/C02/T1')
                      .filter(ee.Filter.date(start, end))
                      .filterBounds(areaOfInterest);
  
    
    var s2size=sentinelImageCollection.size();
    var VIIRSsize=VIIRSImageCollection.size();
    var MODISsize=MODISImageCollection.size();
    var L8size=L8ImageCollection.size();
    
    print("Number of Sentinel 2 Image during selected period= ",s2size);
    print("Number of VIIRS Image during selected period= ",VIIRSsize);
    print("Number of MODIS Image during selected period= ",MODISsize);
    print("Number of Landsat Image during selected period= ",L8size);
    
      var satellitesId = ["Sentinel2 Image", "VIIRS Image", "MODIS Image", "Landsat Image"];
  app.satellite.select.items().reset(satellitesId);
  // Default the image picker to the first id.
  app.satellite.select.setValue(app.satellite.select.items().get(0));
  
  app.setLoadingMode(false);
  
  }
    
  /** Refreshes the current map layer based on the UI widget states. */
  app.refreshMapLayer = function() {
    var imageId = app.picker.select.getValue();
    if (imageId) {
      // removeLayer(imageId)
      var realID = mappedImageID[imageId]
      // If an image id is found, create an image.
      var image = ee.Image(app.COLLECTION_ID + '/' + realID);
      // Add the image to the map with the corresponding visualization options.
      var visOption = app.VIS_OPTIONS[app.vis.select.getValue()];
      print(visOption);
      

      if (app.COLLECTION_ID == "NOAA/VIIRS/001/VNP09GA" || app.COLLECTION_ID == "MODIS/061/MCD43A4"){
        image = image.clip(areaOfInterest);
      }
      
      if (app.COLLECTION_ID == "COPERNICUS/S2" && visOption.name == "NDWI") {
        image = image.normalizedDifference(['B3', 'B8']).rename("NDWI");
      }
      else if (app.COLLECTION_ID == "NOAA/VIIRS/001/VNP09GA" && visOption.name == "NDWI"){
        image = image.clip(areaOfInterest);
        image = image.normalizedDifference(['M4', 'M7']);
      }
      else if (app.COLLECTION_ID == "MODIS/061/MCD43A4" && visOption.name == "NDWI"){
        image = image.clip(areaOfInterest);
        image = image.normalizedDifference(['Nadir_Reflectance_Band2', 'Nadir_Reflectance_Band6']);
      }  
      else if (app.COLLECTION_ID == "LANDSAT/LC08/C02/T1" && visOption.name == "NDWI"){
        image = image.normalizedDifference(['B3', 'B5']);
      } 
      
      
      var visParams = visOption.visParams
      if (visOption.name == 'Natural colour') {
        if (app.COLLECTION_ID == "NOAA/VIIRS/001/VNP09GA") {
          visParams["bands"]=['M5', 'M4', 'M3']
          visParams["min"]=[0]
          visParams["max"]=[3000]
        } else if (app.COLLECTION_ID == "MODIS/061/MCD43A4") {
          visParams["bands"]=['Nadir_Reflectance_Band1', 'Nadir_Reflectance_Band4', 'Nadir_Reflectance_Band3']
          visParams["min"]=[0]
          visParams["max"]=[4000]
          visParams["gamma"]=[1.4]
        } else if (app.COLLECTION_ID == "COPERNICUS/S2") {
          visParams["bands"]=['B4', 'B3', 'B2']
          visParams["min"]=[0]
          visParams["max"]=[5000]
        } else {
          visParams["bands"]=['B4', 'B3', 'B2']
          visParams["min"]=[0]
          visParams["max"]=[30000]
        }
      }
      print(visParams)
      Map.addLayer(image, visParams, imageId + "-" + visOption.name);
    }
  };
};

// Creates the app constants
// var ndwi = image.normalizedDifference(['B3', 'B5']);
app.createConstants = function() {
  app.COLLECTION_ID = 'LANDSAT/LC08/C02/T1_TOA';
  app.SECTION_STYLE = {margin: '20px 0 0 0'};
  app.HELPER_TEXT_STYLE = {
      margin: '8px 0 -3px 8px',
      fontSize: '12px',
      color: 'gray'
  };
  app.IMAGE_COUNT_LIMIT = 10;

  // var ndwi = NDWI_sentinelImage.normalizedDifference(['B3', 'B8']).rename('NDWI');
  app.VIS_OPTIONS = {
    'NDWI': {
      name: "NDWI",
      description: 'Ground features appear in colours similar to their ' +
                  'appearance to the human visual system.',
      visParams:  {palette: ['red', 'yellow', 'green', 'cyan', 'blue']},
    },
    'Natural colour (B4/B3/B2)': {
      name: "Natural colour",
      description: 'Ground features appear in colours similar to their ' +
                  'appearance to the human visual system.',
      visParams: {gamma: 1.1, min: 0, max: 0.3, bands: ['B4', 'B3', 'B2']},
    },
  };
  // var catchment_id = 5050533450;
  // var areaOfInterest = ee.FeatureCollection('WWF/HydroSHEDS/v1/Basins/hybas_5').filter(ee.Filter.eq('HYBAS_ID', catchment_id));
  Map.centerObject(areaOfInterest);
  Map.addLayer(areaOfInterest);
};

var vis = {min: -1, max: 0.5,palette:['red', 'yellow', 'green', 'cyan', 'blue']};
function makeColorBarParams(palette) {
  return {
    bbox: [0, 0, 1, 0.1],
    dimensions: '100x10',
    format: 'png',
    min: 0,
    max: 1,
    palette: palette,
  };
}

// Create the color bar for the legend.
var colorBar = ui.Thumbnail({
  image: ee.Image.pixelLonLat().select(0),
  params: makeColorBarParams(vis.palette),
  style: {stretch: 'horizontal', margin: '0px 8px', maxHeight: '24px'},
});

// Create a panel with three numbers for the legend.
var legendLabels = ui.Panel({
  widgets: [
    ui.Label(vis.min, {margin: '4px 8px'}),
    ui.Label(
        ((vis.max-vis.min) / 2+vis.min),
        {margin: '4px 8px', textAlign: 'center', stretch: 'horizontal'}),
    ui.Label(vis.max, {margin: '4px 8px'})
  ],
  layout: ui.Panel.Layout.flow('horizontal')
});

var legendTitle = ui.Label({
  value: 'NDWI         Threshold',
  style: {fontWeight: 'bold'}
});

// Add the legendPanel to the map.
var legendPanel = ui.Panel([legendTitle, colorBar, legendLabels]);
function outputTiffImage() {
  var imageId = app.picker.select.getValue();
  if (imageId) {
    var realID = mappedImageID[imageId]
    // If an image id is found, create an image.
    var image = ee.Image(app.COLLECTION_ID + '/' + realID);
    // Add the image to the map with the corresponding visualization options.
    var visOption = app.VIS_OPTIONS[app.vis.select.getValue()];
    print(visOption);
    var visParams = visOption.visParams

    if (app.COLLECTION_ID == "NOAA/VIIRS/001/VNP09GA" || app.COLLECTION_ID == "MODIS/061/MCD43A4"){
      image = image.clip(areaOfInterest);
    }
    
    if (app.COLLECTION_ID == "COPERNICUS/S2" && visOption.name == "NDWI") {
      image = image.normalizedDifference(['B3', 'B8']).rename("NDWI");
      visParams["palette"] = ['red', 'yellow', 'green', 'cyan', 'blue']
    }
    else if (app.COLLECTION_ID == "NOAA/VIIRS/001/VNP09GA" && visOption.name == "NDWI"){
      image = image.clip(areaOfInterest);
      image = image.normalizedDifference(['M4', 'M7']);
      visParams["palette"] = ['red', 'yellow', 'green', 'cyan', 'blue']
    }
    else if (app.COLLECTION_ID == "MODIS/061/MCD43A4" && visOption.name == "NDWI"){
      image = image.clip(areaOfInterest);
      image = image.normalizedDifference(['Nadir_Reflectance_Band2', 'Nadir_Reflectance_Band6']);
      visParams["palette"] = ['red', 'yellow', 'green', 'cyan', 'blue']
      
    }  
    else if (app.COLLECTION_ID == "LANDSAT/LC08/C02/T1" && visOption.name == "NDWI"){
      image = image.normalizedDifference(['B3', 'B5']);
      visParams["palette"] = ['red', 'yellow', 'green', 'cyan', 'blue']
    } 
    
    
    
    if (visOption.name == 'Natural colour') {
      if (app.COLLECTION_ID == "NOAA/VIIRS/001/VNP09GA") {
        visParams["bands"]=['M5', 'M4', 'M3']
        visParams["min"]=[0]
        visParams["max"]=[3000]
      } else if (app.COLLECTION_ID == "MODIS/061/MCD43A4") {
        visParams["bands"]=['Nadir_Reflectance_Band1', 'Nadir_Reflectance_Band4', 'Nadir_Reflectance_Band3']
        visParams["min"]=[0]
        visParams["max"]=[4000]
        visParams["gamma"]=[1.4]
      } else if (app.COLLECTION_ID == "COPERNICUS/S2") {
        visParams["bands"]=['B4', 'B3', 'B2']
        visParams["min"]=[0]
        visParams["max"]=[5000]
      } else {
        visParams["bands"]=['B4', 'B3', 'B2']
        visParams["min"]=[0]
        visParams["max"]=[30000]
      }
    }
  }
  return [image, visParams]
}


// Creates the application interface
app.boot = function() {
  app.createConstants();
  app.createHelpers();
  app.createPanels();
  var main = ui.Panel({
    widgets: [
      app.intro.panel,
      app.filters.panel,
      app.threshold.panel,
      app.picker.panel,
      app.vis.panel,
      app.export.panel
    ],
    style: {width: '320px', padding: '8px'}
  });
  ui.root.insert(0, main);
};

app.boot();