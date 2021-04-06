(function (factory, window) {
    // define an AMD module that relies on 'leaflet'
    if (typeof define === "function" && define.amd) {
        define(["leaflet"], factory);

        // define a Common JS module that relies on 'leaflet'
    } else if (typeof exports === "object") {
        module.exports = factory(require("leaflet"));
    }

    // attach your plugin to the global 'L' variable
    if (typeof window !== "undefined" && window.L) {
        factory(L);
    }
})(function (L) {
    class LegendSymbol {
      constructor(control, container, legend) {
        this._control = control;
        this._container = container;
        this._legend = legend;
        this._width = this._control.options.symbolWidth;
        this._height = this._control.options.symbolHeight;
      }
    }

    class GeometricSymbol extends LegendSymbol {
      constructor(control, container, legend) {
        super(control, container, legend);
        this._canvas = this._buildCanvas();
        if (this._drawSymbol) { this._drawSymbol(); }
        this._style();
      }

      _buildCanvas() {
        var canvas = L.DomUtil.create("canvas", null, this._container);
        canvas.height = this._control.options.symbolHeight;
        canvas.width = this._control.options.symbolWidth;
        return canvas;
      }

      _drawSymbol() {}

      _style() {
        var ctx = (this._ctx = this._canvas.getContext("2d"));
        if (this._legend.fill || this._legend.fillColor) {
          ctx.globalAlpha = this._legend.fillOpacity || 1;
          ctx.fillStyle = this._legend.fillColor || this._legend.color;
          ctx.fill(this._legend.fillRule || "evenodd");
        }

        if (this._legend.stroke || this._legend.color) {
          if (this._legend.dashArray) {
            ctx.setLineDash(this._legend.dashArray || []);
          }
          ctx.globalAlpha = this._legend.opacity || 1.0;
          ctx.lineWidth = this._legend.weight || 2;
          ctx.strokeStyle = this._legend.color || "#3388ff";
          ctx.lineCap = this._legend.lineCap || "round";
          ctx.lineJoin = this._legend.lineJoin || "round";
          ctx.stroke();
        }
      }

      rescale() {}

      center() {}
    }

    class CircleSymbol extends GeometricSymbol {
      _drawSymbol() {
        var ctx = (this._ctx = this._canvas.getContext("2d"));
        var legend = this._legend;
        var linelWeight = legend.weight || 3;
        var centerX = this._control.options.symbolWidth / 2;
        var centerY = this._control.options.symbolHeight / 2;
        var maxRadius = Math.min(centerX, centerY) - linelWeight;
        var radius = maxRadius;
        if (legend.radius) {
          radius = Math.min(legend.radius, maxRadius);
        }
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, false);
      }
    }

    L.Control.Legend = L.Control.extend({
        options: {
            position: "topleft",
            title: "Legend",
            legends: [],
            symbolWidth: 24,
            symbolHeight: 24,
            opacity: 1.0,
            column: 1,
            collapsed: false,
        },

        initialize: function (options) {
            L.Util.setOptions(this, options);
            this._legendSymbols = [];
            this._buildContainer();
        },

        onAdd: function (map) {
            this._map = map;
            this._initLayout();
            return this._container;
        },

        _buildContainer: function () {
            this._container = L.DomUtil.create("div", "leaflet-legend leaflet-bar leaflet-control");
            this._container.style.backgroundColor = "rgba(255,255,255, " + this.options.opacity + ")";

            this._contents = L.DomUtil.create("section", "leaflet-legend-contents", this._container);
            this._link = L.DomUtil.create("a", "leaflet-legend-toggle", this._container);
            this._link.title = "Legend";
            this._link.href = "#";

            var title = L.DomUtil.create("h3", "leaflet-legend-title", this._contents);
            title.innerText = this.options.title || "Legend";

            var len = this.options.legends.length;
            var colSize = Math.ceil(len / this.options.column);
            var legendContainer = this._contents;
            for (var i = 0; i < len; i++) {
                if (i % colSize == 0) {
                    legendContainer = L.DomUtil.create("div", "leaflet-legend-column", this._contents);
                }
                var legend = this.options.legends[i];
                this._buildLegendItems(legendContainer, legend);
            }
        },

        _buildLegendItems: function (legendContainer, legend) {
            var legendItemDiv = L.DomUtil.create("div", "leaflet-legend-item", legendContainer);
            if (legend.inactive) {
                L.DomUtil.addClass(legendItemDiv, "leaflet-legend-item-inactive");
            }
            var symbolContainer = L.DomUtil.create("i", null, legendItemDiv);

            var legendSymbol;
            if (legend.type === "circle") {
                legendSymbol = new CircleSymbol(this, symbolContainer, legend);
            } else {
                L.DomUtil.remove(legendItemDiv);
                return;
            }
            this._legendSymbols.push(legendSymbol);

            symbolContainer.style.width = this.options.symbolWidth + "px";
            symbolContainer.style.height = this.options.symbolHeight + "px";

            var legendLabel = L.DomUtil.create("span", null, legendItemDiv);
            legendLabel.innerText = legend.label;
            if (legend.layers) {
                L.DomUtil.addClass(legendItemDiv, "leaflet-legend-item-clickable");
                L.DomEvent.on(
                    legendItemDiv,
                    "click",
                    function () {
                        this._toggleLegend.call(this, legendItemDiv, legend.layers);
                    },
                    this
                );
            }
        },

        _initLayout: function () {
            L.DomEvent.disableClickPropagation(this._container);
            L.DomEvent.disableScrollPropagation(this._container);

            if (this.options.collapsed) {
                this._map.on("click", this.collapse, this);

                L.DomEvent.on(
                    this._container,
                    {
                        mouseenter: this.expand,
                        mouseleave: this.collapse,
                    },
                    this
                );
            } else {
                this.expand();
            }
        },

        _toggleLegend: function (legendDiv, layers) {
            if (L.DomUtil.hasClass(legendDiv, "leaflet-legend-item-inactive")) {
                L.DomUtil.removeClass(legendDiv, "leaflet-legend-item-inactive");
                if (L.Util.isArray(layers)) {
                    for (var i = 0, len = layers.length; i < len; i++) {
                        this._map.addLayer(layers[i]);
                    }
                } else {
                    this._map.addLayer(layers);
                }
            } else {
                L.DomUtil.addClass(legendDiv, "leaflet-legend-item-inactive");
                if (L.Util.isArray(layers)) {
                    for (var i = 0, len = layers.length; i < len; i++) {
                        this._map.removeLayer(layers[i]);
                    }
                } else {
                    this._map.removeLayer(layers);
                }
            }
        },

        expand: function () {
            this._link.style.display = "none";
            L.DomUtil.addClass(this._container, "leaflet-legend-expanded");
            for (var legendSymbol of this._legendSymbols) {
                legendSymbol.rescale();
            }
            return this;
        },

        collapse: function () {
            this._link.style.display = "block";
            L.DomUtil.removeClass(this._container, "leaflet-legend-expanded");
            return this;
        },

        redraw: function () {
            L.DomUtil.empty(this._contents);
            this._buildLegendItems();
        },
    });

    L.control.legend = L.control.Legend = function (options) {
        return new L.Control.Legend(options);
    };
}, window);
