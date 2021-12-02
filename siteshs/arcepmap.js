GeoSearchControl      = window.GeoSearch.GeoSearchControl;
OpenStreetMapProvider = window.GeoSearch.OpenStreetMapProvider;

function metrobounds(margin=0) {
  const corner1 = L.latLng(40.33355568-margin, -6.14127657-margin);
  const corner2 = L.latLng(52.08898944+margin, 10.56009360+margin);
  return L.latLngBounds(corner1, corner2);
}

class ArcepMap {
  mapid;
  map;
  // Fonction de creation des features pour chaque point.
  // Par défaut chaque feature donne lieu à la création d'un unique point sans popup ni champs de filtre
  features = function(prop) { return [ { marker:{ radius: 5, color: "#000000", opacity: 1}, fields:{} } ]; };
  
  constructor(mapid='mapid', options={}) {
    this.mapid = mapid;
    this.maxzoom      = options['maxzoom'] ?? 16;
    this.vue_lat      = options['vue-lat'] ?? 46.49389;
    this.vue_long     = options['vue-long'] ?? 2.602778;
    this.vue_zoom     = options['vue-zoom'] ?? 6;
    this.full_screen  = options['fullscreen'] ?? true;
    this.url_template = options['url-template'] ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    this.show_locate  = options['show_locate'] ?? true;
    this.show_search  = options['show_search'] ?? true;
    this.url_hash     = options['url_hash'] ?? true;
  }
  
  // Initialise la carte
  initialise() {
    let self = this;
    this.map = L.map(this.mapid, { // Empty dict to remove full screen button
      fullscreenControl: { pseudoFullscreen: false }, // if true, fullscreen to page width and height
      maxZoom: self.maxzoom,
      maxBounds: metrobounds(0)
    }).setView([self.vue_lat, self.vue_long], self.vue_zoom);
    
    // Canvas renderer
    this.renderer = L.canvas({ padding: 0.5 });
    
    // On ajoute le fond de carte
    L.tileLayer(
      this.url_template,
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">les contributeurs d’OpenStreetMap</a>',
        maxZoom: self.maxzoom,
      }).addTo(this.map);

    // On ajoute une échelle en haut à droite
    L.control.scale({ position: 'topright', imperial:false}).addTo(this.map);
    
    if (this.url_hash) {
      var hash = new L.Hash(this.map);
    }
    // On gère la géolocalisation de l'utilisateur
    if (this.show_locate) {
      L.control.locate({
        position: 'topleft',
        setView: 'untilPanOrZoom',
        flyTo: false,
        cacheLocation: true,
        drawMarker: true,
        drawCircle: false,
        showPopup: false,
        keepCurrentZoomLevel: true
      }).addTo(this.map);
    }
    
    if (this.show_search) {
      // On définit le fournisseur sur lequel on va s'appuyer pour effectuer les recherches d'adresse
      // On restreint uniquement les recherches pour la France
      let provider = new OpenStreetMapProvider({ params: { countrycodes: 'fr' } });
      // On définit le module de recherche
      let searchControl = new GeoSearchControl({
        provider: provider,
        showMarker: true,
        showPopup: false,
        marker: {
          icon: new L.Icon.Default,
          draggable: false,
          interactive: false
        },
        maxMarkers: 1,
        retainZoomLevel: false,
        animateZoom: true,
        autoClose: true,
        searchLabel: "Entrez l'adresse",
        keepResult: true
      });
      this.map.addControl(searchControl);
    }
  }
  
  addFeatureLayer(layerFields,layer) {
    this.map.addLayer(layer);
  }
  
  onNewData() { }
  
  // Construit la couche des points à partir du CSV et l'ajoute à map
  loadCSVLayer(data) {
    let self = this;
    this.clearAllLayers();
    // Use PapaParse to convert string to array of objects
    var csv = Papa.parse(data, {header: true, dynamicTyping: true}).data;
    // For each row in data, create a marker and add it to the map
    for (const i in csv) {
      const row = csv[i];
      const features = self.features(row);
      for (let f in features) {
        const feature = features[f];
        const markerOptions = feature.marker;
        markerOptions.renderer = self.renderer;
        var layer = L.circleMarker([row.lat, row.long], markerOptions);
        if (feature.popup) { layer.bindPopup(feature.popup); }
        self.addFeatureLayer(feature.fields,layer);
      }
    }
    this.onNewData();
  }
  
  // Construit la couche des points à partir du geoJSON et l'ajoute à map
  loadGeoJSONLayer(data) {
    let self = this;
    this.clearAllLayers();
    let geojson = JSON.parse(data);
    if (!geojson.features || geojson.type != "FeatureCollection") {
      return;
    }
    // For each row in data, create a marker and add it to the map
    for (const i in geojson.features) {
      const geojsonfeat = geojson.features[i];
      const features = self.features(geojsonfeat.properties);
      for (let f in features) {
        let coords = geojsonfeat.geometry.coordinates;
        if (coords[0] && coords[1]) {
          const feature = features[f];
          const markerOptions = feature.marker;
          markerOptions.renderer = self.renderer;
          let layer = L.circleMarker([coords[1], coords[0]], markerOptions);
          if (feature.popup) { layer.bindPopup(feature.popup); }
          self.addFeatureLayer(feature.fields,layer);
        }
      }
    }
    this.onNewData();
  }
  
  // Récupère les données geoJSON à partir de l' @url et charge la couche correspondante
  chargeCouche(url,headers={}) {
    var self = this;
    var xhttp = new XMLHttpRequest();
    switch (url.split(".").pop()) {
      case 'csv':
        xhttp.onload = function() { self.loadCSVLayer(this.responseText); };
        break;
      case 'geojson':
        xhttp.onload = function() { self.loadGeoJSONLayer(this.responseText); };
        break;
      default:
        console.log("Format de données non supporté: "+url);
        return;
    }
    xhttp.open("GET", url);
    for (const c in headers) { xhttp.setRequestHeader(c, headers[c]); }
    xhttp.send();
  }
  
  clearAllLayers() {}
}

class ArcepFilteredMap extends ArcepMap {
  filters = []; // An array of filtering functions
  groups = {};  // A map from concatenated fields to an array of layers
  fields = [];  // The considered fields
  
  constructor(fields,mapid='mapid',options={}) {
    super(mapid=mapid,options=options);
    this.fields=fields;
  }
  
  // Met à jour la taille des marqueurs
  refreshRadius(force=false) {
    if (this.radiusMap) {
      const newradius = this.radiusMap[this.map.getZoom()];
      if (newradius != this.radius || force) {
        this.radius = newradius;
        for (const gid in this.groups) {
          this.groups[gid].layers.forEach(layer => layer.setRadius(newradius));
        }
      }
    }
  }
  
  onNewData() {
    super.onNewData();
    this.refreshRadius(true);
  }
  
  addRadiusMap(radiusmap) { this.radiusMap = radiusmap; }
  
  // Initialise la carte
  initialise() {
    super.initialise();
    const self = this;
    this.map.on('zoomend', function (e) { self.refreshRadius(); });
  }
  
  addLegend(groups, params) {
    const self = this;
    L.control.Legend({
        position   : params.position    || 'bottomleft',
        opacity    : params.opacity     || 0.8,
        symbolWidth: params.symbolWidth || 18,
        legends: groups.map(function(g) {
          const group = self.getGroup(g.fields);
          return {
            label      : g.name  || group.name,
            type       : g.type  || "circle",
            color      : g.color || "black",
            fillColor  : g.fillColor || "#FFFFFF",
            fillOpacity: g.fillOpacity || 0.7,
            weight:1,
            layers: group.layers,
          };
        })
      }).addTo(this.map);
  }
  
  addFilter(filter) {
    const id = this.filters.push(filter)-1;
    this.refreshAllFilters();
    return id;
  }
  
  hideGroup(group) {
    const map = this.map;
    group.layers.forEach(layer => map.removeLayer(layer));
  }
  
  disableGroup(group) {
    if (group.active) { this.hideGroup(group); }
    group.active = false;
  }
  
  enableGroup(group) {
    const map = this.map;
    if (!group.active) {
      group.layers.forEach(layer => map.addLayer(layer));
      group.active = true;
    }
  }
  
  isActive(fields) {
    for (const f in this.filters) {
      if (!this.filters[f](fields)) { return false; }
    }
    return true;
  }
  
  refreshFilter(filterid) { return this._refreshFilter(this.filters[filterid]); }
  
  refreshAllFilters() {
    for (const gid in this.groups) {
      const group = this.groups[gid];
      if (this.isActive(group.fields)) { this.enableGroup(group);  }
      else                             { this.disableGroup(group); }
    }
  }
  
  getGroup(layerFields) {
    const groupid = this.fields.map(field => layerFields[field]).join(',');
    if (this.groups[groupid] === undefined) {
      const activegroup = this.isActive(layerFields);
      this.groups[groupid] = {
        name   : groupid,
        fields : layerFields,
        active : activegroup,
        layers : []
      };
    }
    return this.groups[groupid];
  }
  
  addFeatureLayer(layerFields,layer) {
    const group = this.getGroup(layerFields);
    if (this.radiusMap) {
      layer.setRadius(this.radiusMap[this.map.getZoom()]);
    }
    group.layers.push(layer);
    if (group.active) {
      this.map.addLayer(layer);
    }
  }
  
  clearGroup(group) {
    let self = this;
    if (group.active) {
      group.layers.forEach(function (e) { self.map.removeLayer(e); });
    }
  }
  
  clearAllLayers() {
    for (let g in this.groups) {
      this.clearGroup(this.groups[g]);
      this.groups[g].layers.length = 0;
    };
  }
}
