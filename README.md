# Flood mapping in Australia by using Google Earth Engine

## Description

Australia’s susceptibility to floods and the related impacts on human and environmental factors underscore the urgent need for comprehensive flood monitoring. Unfortunately, the availability of flood monitoring tools to achieve this demand still remains insufficient for the public. To tackle this concern, Google Earth Engine (GEE), a cloud-based platform that provides access to abundant geospatial data, is introduced as a foundation for the developed flood mapping tool in this project. However, similar to the other existing flood monitoring systems, GEE, still requires substantial technical expertise such as JavaScript and remote sensing to access and process data, posing an availability barrier to the public. To address these challenges, the flood detection tool in this study aims to apply a user-friendly interface that simplifies the procedure of code writing. Four optical satellites (MODIS, VIIRS, Sentinel-2, LANDSAT 8) were compiled in the model to allow timely, precise, and comprehensive flood mapping experience. The water detection algorithm utilises Normalised Difference Water Index (NDWI) to distinguish water bodies from other features and provides customisable NDWI thresholds for each satellite. Robust cloud removal strategies and the use of spectral response differences are employed to overcome challenges in cloud obstruction. Finally, the precision and consistency of the model in detecting water bodies were validated by the case study at a subbasin of Murray Darling Basin, which captured extreme flood event during November 2022. By comparing model results with the ground truth data of the Darling River, the developed model is considered to reach high consistency across all satellites. 

## Method



### Flood Information
- Interactive map interface to select the catchment area
- define flood period by start and end dates.
### Select Satellite
Select desire satellite from four options:
- Sentinel 2
- VIIRS 
- MODIS 
- Landsat 8

### Input NDWI Threshold
NDWI Threshold is set at default value of 0.
This will vary based on different locations, time and selected satellite, and hence visual validation by the user will be required.
### Single-date image selection
Users can select a single-date image within the specified time for the chosen satellite.
### Visualisation selection
Users can choose between Natural colour (RGB) and NDWI visualisation, tailoring the output to their specific analytical need.
